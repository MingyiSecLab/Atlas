import type {
  RuntimeSearchBoardSnapshot,
  RuntimeSearchEvent,
  RuntimeSearchExploreDecision,
  RuntimeSearchFact,
  RuntimeSearchHint,
  RuntimeSearchIntent,
  RuntimeSearchLease,
  RuntimeSearchProjectConfig,
  RuntimeSearchProjectRestore,
  RuntimeSearchReasonDecision,
  RuntimeSearchRunOptions,
  RuntimeSearchStatus,
  RuntimeSearchWorkerContext,
  RuntimeStateSearchProject,
  RuntimeStateSearchService
} from './types.js'

const DEFAULT_MAX_FACTS = 1000
const DEFAULT_MAX_INTENTS = 2000
const DEFAULT_MAX_HINTS = 200
const DEFAULT_LEASE_MS = 60_000
const DEFAULT_MAX_DESCRIPTION = 4_000
const MAX_STEPS = 200
const MAX_CONCURRENCY = 16

function text(value: string, field: string, maxLength: number): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} must not be empty.`)
  if (normalized.length > maxLength) throw new Error(`${field} exceeds ${maxLength} characters.`)
  return normalized
}

function positiveLimit(
  value: number | undefined,
  fallback: number,
  field: string,
  max: number
): number {
  const result = value ?? fallback
  if (!Number.isInteger(result) || result < 1 || result > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}.`)
  }
  return result
}

function cloneIntent(intent: RuntimeSearchIntent): RuntimeSearchIntent {
  return { ...intent, from: [...intent.from] }
}

function cloneFact(fact: RuntimeSearchFact): RuntimeSearchFact {
  return { ...fact }
}

function cloneHint(hint: RuntimeSearchHint): RuntimeSearchHint {
  return { ...hint }
}

function cloneLease(lease: RuntimeSearchLease | undefined): RuntimeSearchLease | undefined {
  return lease ? { ...lease } : undefined
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('State-space search was aborted.')
}

class InMemoryStateSearchProject implements RuntimeStateSearchProject {
  readonly id: string
  readonly config: RuntimeSearchProjectConfig

  private status: RuntimeSearchStatus = 'active'
  private readonly facts = new Map<string, RuntimeSearchFact>()
  private readonly intents = new Map<string, RuntimeSearchIntent>()
  private readonly hints = new Map<string, RuntimeSearchHint>()
  private reason?: RuntimeSearchLease
  private factSequence = 0
  private intentSequence = 0
  private hintSequence = 0
  private readonly listeners = new Set<(event: RuntimeSearchEvent) => void>()
  private readonly maxFacts: number
  private readonly maxIntents: number
  private readonly maxHints: number
  private readonly intentLeaseMs: number
  private readonly reasonLeaseMs: number
  private readonly maxDescriptionLength: number

  constructor(
    id: string,
    config: RuntimeSearchProjectConfig,
    restore?: RuntimeSearchProjectRestore
  ) {
    this.id = text(id, 'project id', 128)
    this.config = {
      ...config,
      title: text(config.title, 'title', 200),
      origin: text(config.origin, 'origin', config.maxDescriptionLength ?? DEFAULT_MAX_DESCRIPTION),
      goal: text(config.goal, 'goal', config.maxDescriptionLength ?? DEFAULT_MAX_DESCRIPTION),
      authorization: {
        ...config.authorization,
        principal: text(config.authorization.principal, 'authorization principal', 200),
        authorizationRef: text(
          config.authorization.authorizationRef,
          'authorization reference',
          200
        ),
        scope: config.authorization.scope.map((entry) => text(entry, 'authorization scope', 500))
      }
    }
    if (this.config.authorization.scope.length === 0) {
      throw new Error('At least one authorized scope entry is required.')
    }
    if (
      this.config.authorization.expiresAt !== undefined &&
      this.config.authorization.expiresAt <= Date.now()
    ) {
      throw new Error('Authorization has expired.')
    }
    this.maxDescriptionLength = positiveLimit(
      config.maxDescriptionLength,
      DEFAULT_MAX_DESCRIPTION,
      'maxDescriptionLength',
      20_000
    )
    this.maxFacts = positiveLimit(config.maxFacts, DEFAULT_MAX_FACTS, 'maxFacts', 10_000)
    this.maxIntents = positiveLimit(config.maxIntents, DEFAULT_MAX_INTENTS, 'maxIntents', 20_000)
    this.maxHints = positiveLimit(config.maxHints, DEFAULT_MAX_HINTS, 'maxHints', 2_000)
    this.intentLeaseMs = positiveLimit(
      config.intentLeaseMs,
      DEFAULT_LEASE_MS,
      'intentLeaseMs',
      86_400_000
    )
    this.reasonLeaseMs = positiveLimit(
      config.reasonLeaseMs,
      DEFAULT_LEASE_MS,
      'reasonLeaseMs',
      86_400_000
    )

    this.facts.set('origin', {
      id: 'origin',
      description: this.config.origin,
      createdAt: Date.now()
    })
    this.facts.set('goal', { id: 'goal', description: this.config.goal, createdAt: Date.now() })

    if (restore) {
      // 持久化恢复：原样回填 board（含 origin/goal 的原始描述与时间戳）与终态。
      this.status = restore.status
      this.facts.clear()
      for (const fact of restore.facts) this.facts.set(fact.id, cloneFact(fact))
      for (const intent of restore.intents) this.intents.set(intent.id, cloneIntent(intent))
      for (const hint of restore.hints) this.hints.set(hint.id, cloneHint(hint))
      this.hintSequence = restore.hints.length
      this.intentSequence = restore.intents.length
      this.factSequence = Math.max(
        0,
        ...restore.facts
          .map((fact) => Number(/^f(\d+)$/.exec(fact.id)?.[1]))
          .filter((value) => Number.isFinite(value) && value > 0)
      )
    }
  }

  snapshot(): RuntimeSearchBoardSnapshot {
    this.expireLeases(Date.now())
    return {
      title: this.config.title,
      status: this.status,
      facts: [...this.facts.values()].map(cloneFact),
      intents: [...this.intents.values()].map(cloneIntent),
      hints: [...this.hints.values()].map(cloneHint),
      reason: cloneLease(this.reason),
      authorization: { ...this.config.authorization, scope: [...this.config.authorization.scope] }
    }
  }

  addHint(content: string, creator: string): RuntimeSearchHint {
    if (this.hints.size >= this.maxHints) throw new Error('Hint limit reached.')
    const hint: RuntimeSearchHint = {
      id: `h${String(++this.hintSequence).padStart(3, '0')}`,
      content: text(content, 'hint content', this.maxDescriptionLength),
      creator: text(creator, 'hint creator', 128),
      createdAt: Date.now()
    }
    this.hints.set(hint.id, hint)
    this.emit({ type: 'hint_added', hint: cloneHint(hint) })
    return cloneHint(hint)
  }

  createIntent(input: {
    from: readonly string[]
    description: string
    creator: string
    worker?: string
  }): RuntimeSearchIntent {
    return this.createIntentRecord(input, true)
  }

  private createIntentRecord(
    input: {
      from: readonly string[]
      description: string
      creator: string
      worker?: string
    },
    deduplicate: boolean
  ): RuntimeSearchIntent {
    this.ensureActive()
    if (this.intents.size >= this.maxIntents) throw new Error('Intent limit reached.')
    const from = [...new Set(input.from.map((id) => text(id, 'fact id', 128)))]
    if (from.length === 0) throw new Error('Intent must reference at least one fact.')
    if (from.includes('goal')) throw new Error('The goal fact cannot be used as an intent source.')
    for (const factId of from)
      if (!this.facts.has(factId)) throw new Error(`Fact ${factId} not found.`)
    const creator = text(input.creator, 'intent creator', 128)
    const worker = input.worker === undefined ? undefined : text(input.worker, 'intent worker', 128)
    if (worker !== undefined && worker !== creator)
      throw new Error('Intent worker must equal creator.')
    const description = text(input.description, 'intent description', this.maxDescriptionLength)
    if (deduplicate) {
      const duplicate = [...this.intents.values()].find(
        (intent) =>
          !intent.to &&
          intent.description === description &&
          [...intent.from].sort().join('\u0000') === [...from].sort().join('\u0000')
      )
      if (duplicate) return cloneIntent(duplicate)
    }
    const intent: RuntimeSearchIntent = {
      id: `i${String(++this.intentSequence).padStart(3, '0')}`,
      from,
      description,
      creator,
      worker,
      lastHeartbeatAt: worker ? Date.now() : undefined,
      createdAt: Date.now()
    }
    this.intents.set(intent.id, intent)
    this.emit({ type: 'intent_created', intent: cloneIntent(intent) })
    return cloneIntent(intent)
  }

  claimIntent(intentId: string, worker: string, now = Date.now()): RuntimeSearchIntent {
    this.ensureActive()
    const intent = this.openIntent(intentId)
    const workerId = text(worker, 'worker', 128)
    this.expireLeases(now)
    if (intent.worker && intent.worker !== workerId)
      throw new Error(`Intent is currently claimed by ${intent.worker}.`)
    intent.worker = workerId
    intent.lastHeartbeatAt = now
    const result = cloneIntent(intent)
    this.emit({ type: 'intent_claimed', intent: result })
    return result
  }

  heartbeatIntent(intentId: string, worker: string, now = Date.now()): RuntimeSearchIntent {
    this.ensureActive()
    const intent = this.openIntent(intentId)
    const workerId = text(worker, 'worker', 128)
    this.expireLeases(now)
    if (intent.worker && intent.worker !== workerId)
      throw new Error(`Intent is currently claimed by ${intent.worker}.`)
    intent.worker = workerId
    intent.lastHeartbeatAt = now
    return cloneIntent(intent)
  }

  releaseIntent(intentId: string, worker: string): RuntimeSearchIntent {
    this.ensureActive()
    const intent = this.openIntent(intentId)
    const workerId = text(worker, 'worker', 128)
    this.expireLeases(Date.now())
    if (intent.worker && intent.worker !== workerId)
      throw new Error(`Intent is currently claimed by ${intent.worker}.`)
    intent.worker = undefined
    const result = cloneIntent(intent)
    this.emit({ type: 'intent_released', intent: result })
    return result
  }

  concludeIntent(
    intentId: string,
    worker: string,
    description: string,
    now = Date.now()
  ): { intent: RuntimeSearchIntent; fact: RuntimeSearchFact } {
    this.ensureActive()
    if (this.facts.size >= this.maxFacts) throw new Error('Fact limit reached.')
    const intent = this.openIntent(intentId)
    const workerId = text(worker, 'worker', 128)
    this.expireLeases(now)
    if (intent.worker && intent.worker !== workerId)
      throw new Error(`Intent is currently claimed by ${intent.worker}.`)
    const fact: RuntimeSearchFact = {
      id: `f${String(++this.factSequence).padStart(3, '0')}`,
      description: text(description, 'fact description', this.maxDescriptionLength),
      createdAt: now,
      sourceIntentId: intent.id
    }
    this.facts.set(fact.id, fact)
    intent.worker = workerId
    intent.lastHeartbeatAt = now
    intent.to = fact.id
    intent.concludedAt = now
    const result = { intent: cloneIntent(intent), fact: cloneFact(fact) }
    this.emit({ type: 'intent_concluded', intent: result.intent, fact: result.fact })
    this.emit({ type: 'fact_added', fact: result.fact })
    return result
  }

  claimReason(worker: string, trigger: string, now = Date.now()): RuntimeSearchLease {
    this.ensureActive()
    this.expireLeases(now)
    const workerId = text(worker, 'worker', 128)
    if (this.reason && this.reason.worker !== workerId)
      throw new Error(`Reason is currently claimed by ${this.reason.worker}.`)
    this.reason = this.reason ?? {
      worker: workerId,
      trigger: text(trigger, 'reason trigger', 128),
      startedAt: now,
      lastHeartbeatAt: now
    }
    this.reason.lastHeartbeatAt = now
    return { ...this.reason }
  }

  heartbeatReason(worker: string, now = Date.now()): RuntimeSearchLease {
    this.ensureActive()
    this.expireLeases(now)
    if (!this.reason || this.reason.worker !== text(worker, 'worker', 128))
      throw new Error('Reason lease is not held by this worker.')
    this.reason.lastHeartbeatAt = now
    return { ...this.reason }
  }

  releaseReason(worker: string): void {
    this.ensureActive()
    if (this.reason && this.reason.worker !== text(worker, 'worker', 128))
      throw new Error(`Reason is currently claimed by ${this.reason.worker}.`)
    this.reason = undefined
  }

  complete(from: readonly string[], description: string, worker: string): RuntimeSearchIntent {
    this.ensureActive()
    this.expireLeases(Date.now())
    const sources = [...new Set(from.map((id) => text(id, 'fact id', 128)))]
    if (sources.length === 0 || sources.includes('goal'))
      throw new Error('Completion must reference non-goal facts.')
    for (const factId of sources)
      if (!this.facts.has(factId)) throw new Error(`Fact ${factId} not found.`)
    const completion = this.createIntentRecord(
      { from: sources, description, creator: worker, worker },
      false
    )
    completion.to = 'goal'
    completion.concludedAt = Date.now()
    completion.lastHeartbeatAt = completion.concludedAt
    const stored = this.intents.get(completion.id)
    if (!stored) throw new Error('Completion intent was not stored.')
    stored.to = 'goal'
    stored.worker = worker
    stored.concludedAt = completion.concludedAt
    stored.lastHeartbeatAt = completion.lastHeartbeatAt
    this.status = 'completed'
    this.reason = undefined
    this.emit({ type: 'status_changed', status: this.status })
    return cloneIntent(stored)
  }

  stop(): void {
    if (this.status === 'completed') throw new Error('Completed projects cannot be stopped.')
    this.status = 'stopped'
    for (const intent of this.intents.values()) if (!intent.to) intent.worker = undefined
    this.reason = undefined
    this.emit({ type: 'status_changed', status: this.status })
  }

  resume(): void {
    if (this.status === 'completed') throw new Error('Completed projects cannot be resumed.')
    this.status = 'active'
    this.emit({ type: 'status_changed', status: this.status })
  }

  subscribe(listener: (event: RuntimeSearchEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async run(options: RuntimeSearchRunOptions): Promise<RuntimeSearchBoardSnapshot> {
    const worker = text(options.worker, 'worker', 128)
    const maxSteps = positiveLimit(options.maxSteps, 20, 'maxSteps', MAX_STEPS)
    const concurrency = positiveLimit(options.concurrency, 1, 'concurrency', MAX_CONCURRENCY)
    const signal = options.signal ?? new AbortController().signal
    this.emit({ type: 'search_started', worker })
    let steps = 0
    try {
      while (this.status === 'active' && steps < maxSteps) {
        throwIfAborted(signal)
        steps += 1
        if (options.reason) {
          this.claimReason(worker, 'search_step')
          let decision: RuntimeSearchReasonDecision
          try {
            decision = await options.reason({
              board: this.snapshot(),
              worker,
              signal,
              executionMode: this.config.authorization.executionMode ?? 'read-only'
            })
          } finally {
            this.releaseReason(worker)
          }
          this.applyReasonDecision(decision, worker)
        }
        const open = this.snapshot()
          .intents.filter((intent) => !intent.to && !intent.worker)
          .slice(0, concurrency)
        if (open.length === 0) break
        await Promise.all(
          open.map(async (candidate) => {
            throwIfAborted(signal)
            const intent = this.claimIntent(candidate.id, worker)
            const context: RuntimeSearchWorkerContext = {
              board: this.snapshot(),
              intent,
              worker,
              signal,
              executionMode: this.config.authorization.executionMode ?? 'read-only'
            }
            let decision: RuntimeSearchExploreDecision
            try {
              decision = await options.explore(context)
            } catch (error) {
              this.releaseIntent(intent.id, worker)
              throw error
            }
            if (decision.type === 'fact')
              this.concludeIntent(intent.id, worker, decision.description)
            else this.releaseIntent(intent.id, worker)
          })
        )
      }
      const result = this.snapshot()
      this.emit({ type: 'search_finished', worker, status: result.status, steps })
      return result
    } catch (error) {
      if (this.reason?.worker === worker) this.reason = undefined
      this.emit({ type: 'search_finished', worker, status: this.status, steps })
      throw error
    }
  }

  private applyReasonDecision(decision: RuntimeSearchReasonDecision, worker: string): void {
    if (decision.type === 'complete') {
      this.complete(decision.from, decision.description, worker)
      return
    }
    if (decision.type === 'intents') {
      for (const intent of decision.intents) this.createIntent({ ...intent, creator: worker })
    }
  }

  private openIntent(intentId: string): RuntimeSearchIntent {
    const id = text(intentId, 'intent id', 128)
    const intent = this.intents.get(id)
    if (!intent) throw new Error(`Intent ${id} not found.`)
    if (intent.to) throw new Error(`Intent ${id} is already concluded.`)
    return intent
  }

  private ensureActive(): void {
    if (this.status !== 'active') throw new Error(`Project is ${this.status}.`)
    if (
      this.config.authorization.expiresAt !== undefined &&
      this.config.authorization.expiresAt <= Date.now()
    ) {
      throw new Error('Authorization has expired.')
    }
  }

  private expireLeases(now: number): void {
    for (const intent of this.intents.values()) {
      if (
        !intent.to &&
        intent.worker &&
        intent.lastHeartbeatAt &&
        now - intent.lastHeartbeatAt > this.intentLeaseMs
      ) {
        intent.worker = undefined
      }
    }
    if (this.reason && now - this.reason.lastHeartbeatAt > this.reasonLeaseMs)
      this.reason = undefined
  }

  private emit(event: RuntimeSearchEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // Observers must not be able to break graph consistency.
      }
    }
  }
}

export function createRuntimeStateSearchService(): RuntimeStateSearchService {
  let projectSequence = 0
  return {
    create: (config, restore) => {
      if (!restore) {
        return new InMemoryStateSearchProject(
          `search_${String(++projectSequence).padStart(3, '0')}`,
          config
        )
      }
      // 恢复的 project 沿用原 id，并把进程序列推过已用的编号，避免后续 create 撞号。
      const restoredNumber = Number(/search_(\d+)$/.exec(restore.id)?.[1])
      if (Number.isFinite(restoredNumber) && restoredNumber > projectSequence) {
        projectSequence = restoredNumber
      }
      return new InMemoryStateSearchProject(restore.id, config, restore)
    }
  }
}
