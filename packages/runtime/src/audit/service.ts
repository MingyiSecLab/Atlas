import { randomUUID } from 'node:crypto'
import { FileAuditStore } from './store.js'
import type { RuntimeAuditStore } from './types.js'
import {
  AuditRunError,
  type AuditCoverageUnit,
  type AuditEvent,
  type AuditFinding,
  type AuditPhase,
  type AuditProfile,
  type AuditRun,
  type AuditRunSnapshot,
  type AuditTraceStep,
  type AuditUnitStatus,
  type RuntimeAuditRunHandle as AuditRunHandle,
  type RuntimeAuditService
} from './types.js'

export interface RuntimeAuditServiceOptions {
  store?: RuntimeAuditStore
}

/** 无 owner 状态：进入这些状态时清空归属，显式携带 owner 则拒绝。 */
const UNIT_NO_OWNER: ReadonlySet<AuditUnitStatus> = new Set([
  'deferred',
  'not_applicable',
  'out_of_scope'
])

/** owner 持有状态：必须声明归属 agent。 */
const UNIT_OWNED: ReadonlySet<AuditUnitStatus> = new Set([
  'in_progress',
  'covered',
  'candidate',
  'blocked'
])

/**
 * 单元状态迁移表（同状态更新始终允许）。planned 可直接落到终态：父编排器常在
 * hunter 返回后一次性合并结果，不强制经过 in_progress。已闭环单元只能被重新
 * 分配（→ in_progress），不能回退为 planned 或改为无 owner 状态。
 */
const UNIT_TRANSITIONS: Readonly<Record<AuditUnitStatus, readonly AuditUnitStatus[]>> = {
  planned: [
    'in_progress',
    'covered',
    'candidate',
    'blocked',
    'deferred',
    'not_applicable',
    'out_of_scope'
  ],
  in_progress: [
    'planned',
    'covered',
    'candidate',
    'blocked',
    'deferred',
    'not_applicable',
    'out_of_scope'
  ],
  covered: ['in_progress'],
  candidate: ['in_progress', 'covered', 'blocked'],
  blocked: ['in_progress', 'covered', 'candidate', 'deferred'],
  deferred: ['planned', 'in_progress'],
  not_applicable: ['planned'],
  out_of_scope: ['planned']
}

/** 与 audit-hunter 输出契约一致的 fingerprint 形状。 */
const FINGERPRINT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/

function sanitizePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim())
    .slice(0, 200)
}

function nonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** 单元不变量校验（seed 与 update 共用）。 */
function assertUnitInvariants(unit: AuditCoverageUnit): void {
  const id = unit.coverageId
  if (UNIT_NO_OWNER.has(unit.status)) {
    if (unit.agentId) {
      throw new AuditRunError(`Unit ${id}: status ${unit.status} must not carry an owner agent.`)
    }
    if (!nonEmpty(unit.reason)) {
      throw new AuditRunError(`Unit ${id}: status ${unit.status} requires a precise reason.`)
    }
  }
  if (UNIT_OWNED.has(unit.status) && !unit.agentId) {
    throw new AuditRunError(`Unit ${id}: status ${unit.status} requires an owner agentId.`)
  }
  if (unit.status === 'covered') {
    if (unit.reviewedPaths.length === 0 || unit.checks.length === 0) {
      throw new AuditRunError(`Unit ${id}: covered requires non-empty reviewedPaths and checks.`)
    }
    if (unit.unresolved.length > 0) {
      throw new AuditRunError(`Unit ${id}: covered must not carry unresolved facts.`)
    }
  }
  if (unit.status === 'candidate' && unit.fingerprints.length === 0) {
    throw new AuditRunError(`Unit ${id}: candidate requires at least one fingerprint.`)
  }
  if (unit.status === 'blocked' && unit.unresolved.length === 0) {
    throw new AuditRunError(`Unit ${id}: blocked requires at least one unresolved fact.`)
  }
}

function assertTrace(trace: readonly AuditTraceStep[]): void {
  for (const step of trace) {
    if (!nonEmpty(step.path) || step.path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(step.path)) {
      throw new AuditRunError(`Trace path must be repository-relative: ${step.path}`)
    }
    if (step.path.split(/[\\/]/).includes('..')) {
      throw new AuditRunError(`Trace path must not escape the repository: ${step.path}`)
    }
    if (step.line !== undefined && (!Number.isInteger(step.line) || step.line < 1)) {
      throw new AuditRunError(`Trace line must be a positive integer: ${step.path}:${step.line}`)
    }
  }
  if (trace.length >= 2) {
    if (trace[0]?.kind !== 'entrypoint' || trace[trace.length - 1]?.kind !== 'sink') {
      throw new AuditRunError('Multi-step trace must start with entrypoint and end with sink.')
    }
    if (trace.slice(1, -1).some((step) => step.kind !== 'propagation')) {
      throw new AuditRunError('Intermediate trace steps must be propagation.')
    }
  }
}

type FindingInput = Partial<Omit<AuditFinding, 'id' | 'recordedAt' | 'updatedAt'>> & {
  fingerprint: string
  title: string
  verdict: AuditFinding['verdict']
}

/**
 * 按 verdict 契约校验并构建记录：只保留该 verdict 允许的字段，
 * 改判时旧 verdict 的专属字段（如 severity / blockers）不会残留。
 */
function buildFinding(
  input: FindingInput,
  identity: { id: string; recordedAt: number },
  now: number
): AuditFinding {
  const fingerprint = input.fingerprint?.trim()
  if (!fingerprint) {
    throw new AuditRunError('Finding requires a stable fingerprint.')
  }
  if (!FINGERPRINT_PATTERN.test(fingerprint)) {
    throw new AuditRunError(
      `Fingerprint must match ${FINGERPRINT_PATTERN.source} (no spaces or line numbers): ${fingerprint}`
    )
  }
  if (!nonEmpty(input.title)) {
    throw new AuditRunError('Finding requires a title.')
  }
  const trace = input.trace ?? []
  assertTrace(trace)

  const base = {
    id: identity.id,
    fingerprint,
    title: input.title.trim(),
    verdict: input.verdict,
    description: input.description ?? '',
    trace,
    evidence: input.evidence ?? [],
    coverageIds: input.coverageIds ?? [],
    recordedAt: identity.recordedAt,
    updatedAt: now
  }

  if (input.verdict === 'confirmed') {
    const missing = (['severity', 'rootCause', 'observedResult', 'remediation'] as const).filter(
      (key) => !nonEmpty(input[key])
    )
    if (missing.length > 0) {
      throw new AuditRunError(`Confirmed finding requires: ${missing.join(', ')}.`)
    }
    if (trace.length === 0) {
      throw new AuditRunError('Confirmed finding requires a source trace.')
    }
    return {
      ...base,
      severity: input.severity!,
      rootCause: input.rootCause!,
      observedResult: input.observedResult!,
      remediation: input.remediation!,
      ...(input.conditions ? { conditions: input.conditions } : {})
    }
  }

  if (input.verdict === 'needs_validation') {
    if (!input.blockers?.some(nonEmpty)) {
      throw new AuditRunError('needs_validation finding requires at least one blocker.')
    }
    if (!nonEmpty(input.validationPlanLocal) && !nonEmpty(input.validationPlanDeployment)) {
      throw new AuditRunError(
        'needs_validation finding requires validationPlanLocal or validationPlanDeployment.'
      )
    }
    return {
      ...base,
      blockers: input.blockers.filter(nonEmpty),
      ...(nonEmpty(input.claimedRootCause) ? { claimedRootCause: input.claimedRootCause } : {}),
      ...(nonEmpty(input.validationPlanLocal)
        ? { validationPlanLocal: input.validationPlanLocal }
        : {}),
      ...(nonEmpty(input.validationPlanDeployment)
        ? { validationPlanDeployment: input.validationPlanDeployment }
        : {})
    }
  }

  if (!nonEmpty(input.rejectionReason)) {
    throw new AuditRunError('rejected finding requires a rejection reason.')
  }
  return {
    ...base,
    rejectionReason: input.rejectionReason,
    ...(nonEmpty(input.claimedRootCause) ? { claimedRootCause: input.claimedRootCause } : {})
  }
}

/** complete 终态前的台账一致性校验；返回违规项（空数组表示可完成）。 */
function completionViolations(run: AuditRun): string[] {
  const violations: string[] = []
  if (run.units.length === 0) {
    violations.push('coverage ledger is empty')
  }
  const open = run.units.filter(
    (unit) => unit.status === 'planned' || unit.status === 'in_progress'
  )
  if (open.length > 0) {
    violations.push(
      `${open.length} unit(s) still planned/in_progress: ${open
        .slice(0, 10)
        .map((unit) => unit.coverageId)
        .join(', ')}`
    )
  }
  const recorded = new Set(run.findings.map((finding) => finding.fingerprint))
  const unrecorded = [
    ...new Set(
      run.units
        .filter((unit) => unit.status === 'candidate')
        .flatMap((unit) => unit.fingerprints)
        .filter((fingerprint) => !recorded.has(fingerprint))
    )
  ]
  if (unrecorded.length > 0) {
    violations.push(`candidate fingerprint(s) without a final record: ${unrecorded.join(', ')}`)
  }
  return violations
}

/**
 * 代码审计运行服务：内存权威状态 + 可选文件持久化 + 事件订阅。
 *
 * 写入口只有 run 句柄上的五个方法（phase/status/seed/updateUnit/recordFinding），
 * Desktop 与工具层都只能经由它们变更状态，保证台账状态机不被绕过。
 */
class AuditRunHandleImpl implements AuditRunHandle {
  readonly id: string
  private readonly run: AuditRun
  private readonly persist: () => Promise<void>
  private readonly emit: (event: AuditEvent) => void

  constructor(run: AuditRun, persist: () => Promise<void>, emit: (event: AuditEvent) => void) {
    this.id = run.id
    this.run = run
    this.persist = persist
    this.emit = emit
  }

  snapshot(): AuditRunSnapshot {
    return JSON.parse(JSON.stringify(this.run)) as AuditRunSnapshot
  }

  private assertWritable(): void {
    if (this.run.runStatus !== 'in_progress') {
      throw new AuditRunError(
        `Audit run ${this.run.id} is already ${this.run.runStatus}; start a new run with init_audit_run.`
      )
    }
  }

  setPhase(phase: AuditPhase): void {
    this.assertWritable()
    this.run.phase = phase
    this.run.updatedAt = Date.now()
    this.emit({ type: 'phase_changed', runId: this.run.id, phase })
    void this.persist()
  }

  setRunStatus(runStatus: AuditRun['runStatus'], incompleteReason?: string): void {
    this.assertWritable()
    if (runStatus === 'complete') {
      const violations = completionViolations(this.run)
      if (violations.length > 0) {
        throw new AuditRunError(
          `Run cannot be complete: ${violations.join('; ')}. Close the gaps or mark it incomplete with a precise reason.`
        )
      }
    }
    if (runStatus === 'incomplete' && !nonEmpty(incompleteReason)) {
      throw new AuditRunError('incomplete run requires a precise incompleteReason.')
    }
    this.run.runStatus = runStatus
    this.run.incompleteReason = runStatus === 'incomplete' ? incompleteReason : undefined
    this.run.updatedAt = Date.now()
    this.emit({ type: 'status_changed', runId: this.run.id, runStatus })
    void this.persist()
  }

  seedUnits(units: ReadonlyArray<Partial<AuditCoverageUnit> & { coverageId: string }>): {
    seeded: number
    rejected: string[]
  } {
    this.assertWritable()
    const existing = new Set(this.run.units.map((unit) => unit.coverageId))
    const rejected: string[] = []
    const accepted: AuditCoverageUnit[] = []
    const now = Date.now()
    for (const input of units) {
      const coverageId = input.coverageId?.trim()
      if (!coverageId || existing.has(coverageId)) {
        rejected.push(coverageId || '<empty>')
        continue
      }
      const status = input.status ?? 'planned'
      const unit: AuditCoverageUnit = {
        coverageId,
        surface: input.surface ?? coverageId,
        boundary: input.boundary ?? '',
        subsystem: input.subsystem ?? '',
        attackClass: input.attackClass ?? '',
        startingPaths: sanitizePaths(input.startingPaths),
        status,
        agentId: UNIT_NO_OWNER.has(status) ? null : (input.agentId ?? null),
        reviewedPaths: sanitizePaths(input.reviewedPaths),
        checks: input.checks ?? [],
        fingerprints: sanitizePaths(input.fingerprints),
        unresolved: sanitizePaths(input.unresolved),
        wave: input.wave ?? 1,
        ...(nonEmpty(input.reason) ? { reason: input.reason } : {}),
        updatedAt: now
      }
      try {
        assertUnitInvariants(unit)
      } catch {
        rejected.push(coverageId)
        continue
      }
      accepted.push(unit)
      existing.add(coverageId)
    }
    if (accepted.length > 0) {
      this.run.units = [...this.run.units, ...accepted]
      this.run.updatedAt = now
      // 批量播种只发一次 run_updated，避免数百个 unit_updated 触发面板逐条重拉快照。
      this.emit({ type: 'run_updated', runId: this.run.id })
      void this.persist()
    }
    return { seeded: accepted.length, rejected }
  }

  updateUnit(
    coverageId: string,
    patch: Partial<Omit<AuditCoverageUnit, 'coverageId' | 'updatedAt'>>
  ): void {
    this.assertWritable()
    const index = this.run.units.findIndex((unit) => unit.coverageId === coverageId)
    const current = index >= 0 ? this.run.units[index] : undefined
    if (!current) {
      throw new AuditRunError(`Unknown coverage unit: ${coverageId}`)
    }
    const nextStatus = patch.status ?? current.status
    if (nextStatus !== current.status && !UNIT_TRANSITIONS[current.status].includes(nextStatus)) {
      throw new AuditRunError(
        `Unit ${coverageId}: transition ${current.status} → ${nextStatus} is not allowed (allowed: ${UNIT_TRANSITIONS[current.status].join(', ')}).`
      )
    }
    if (UNIT_NO_OWNER.has(nextStatus) && patch.agentId) {
      throw new AuditRunError(
        `Unit ${coverageId}: status ${nextStatus} must not carry an owner agent.`
      )
    }
    // 进入无 owner 状态时自动释放归属；其余情况未显式给出 agentId 则沿用。
    const nextAgentId = UNIT_NO_OWNER.has(nextStatus)
      ? null
      : patch.agentId !== undefined
        ? patch.agentId || null
        : current.agentId

    const next: AuditCoverageUnit = {
      ...current,
      ...(patch.surface !== undefined ? { surface: patch.surface } : {}),
      ...(patch.boundary !== undefined ? { boundary: patch.boundary } : {}),
      ...(patch.subsystem !== undefined ? { subsystem: patch.subsystem } : {}),
      ...(patch.attackClass !== undefined ? { attackClass: patch.attackClass } : {}),
      ...(patch.startingPaths !== undefined
        ? { startingPaths: sanitizePaths(patch.startingPaths) }
        : {}),
      status: nextStatus,
      agentId: nextAgentId,
      ...(patch.reviewedPaths !== undefined
        ? { reviewedPaths: sanitizePaths(patch.reviewedPaths) }
        : {}),
      ...(patch.checks !== undefined ? { checks: patch.checks } : {}),
      ...(patch.fingerprints !== undefined
        ? { fingerprints: sanitizePaths(patch.fingerprints) }
        : {}),
      ...(patch.unresolved !== undefined ? { unresolved: sanitizePaths(patch.unresolved) } : {}),
      ...(patch.wave !== undefined ? { wave: patch.wave } : {}),
      ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
      updatedAt: Date.now()
    }
    assertUnitInvariants(next)
    const units = [...this.run.units]
    units[index] = next
    this.run.units = units
    this.run.updatedAt = Date.now()
    this.emit({ type: 'unit_updated', runId: this.run.id, coverageId })
    void this.persist()
  }

  recordFinding(input: FindingInput): { id: string } {
    this.assertWritable()
    const fingerprint = input.fingerprint?.trim()
    const index = this.run.findings.findIndex((finding) => finding.fingerprint === fingerprint)
    const existing = index >= 0 ? this.run.findings[index] : undefined
    const now = Date.now()
    // 同 fingerprint 重录 = 整条替换（保留 id / recordedAt），不做字段合并。
    const finding = buildFinding(
      input,
      existing
        ? { id: existing.id, recordedAt: existing.recordedAt }
        : { id: `finding-${randomUUID().slice(0, 8)}`, recordedAt: now },
      now
    )
    if (existing) {
      const findings = [...this.run.findings]
      findings[index] = finding
      this.run.findings = findings
    } else {
      this.run.findings = [...this.run.findings, finding]
    }
    this.run.updatedAt = now
    this.emit({ type: 'finding_recorded', runId: this.run.id, findingId: finding.id })
    void this.persist()
    return { id: finding.id }
  }
}

export function createRuntimeAuditService(
  options: RuntimeAuditServiceOptions = {}
): RuntimeAuditService {
  const store: RuntimeAuditStore = options.store ?? new FileAuditStore()
  const runs = new Map<string, AuditRun>()
  const handles = new Map<string, AuditRunHandleImpl>()
  const listeners = new Set<(event: AuditEvent) => void>()
  /** 每个 run 至多一个在途写入；写入期间的新变更合并为写完后的再一次写入。 */
  const inflight = new Map<string, Promise<void>>()
  const dirty = new Set<string>()

  const emit = (event: AuditEvent): void => {
    for (const listener of listeners) {
      try {
        listener(event)
      } catch {
        // 监听器异常不阻塞审计状态推进。
      }
    }
  }

  const persistRun = (run: AuditRun): Promise<void> => {
    const pending = inflight.get(run.id)
    if (pending) {
      dirty.add(run.id)
      return pending
    }
    const task = (async () => {
      do {
        dirty.delete(run.id)
        try {
          await store.save(run)
        } catch (error) {
          // 持久化失败不阻塞内存权威状态；下次变更会重试写入。
          console.error(`[audit] failed to persist run ${run.id}:`, error)
        }
      } while (dirty.has(run.id))
    })().finally(() => inflight.delete(run.id))
    inflight.set(run.id, task)
    return task
  }

  const register = (run: AuditRun): AuditRunHandleImpl => {
    runs.set(run.id, run)
    const handle = new AuditRunHandleImpl(run, () => persistRun(run), emit)
    handles.set(run.id, handle)
    return handle
  }

  const newestFirst = (): AuditRun[] => [...runs.values()].sort((a, b) => b.createdAt - a.createdAt)

  const ready = store.load().then((loaded) => {
    for (const run of loaded) {
      if (!runs.has(run.id)) register(run)
    }
  })

  return {
    ready,
    subscribe(listener: (event: AuditEvent) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    create(input: {
      title?: string
      repo: string
      target: string
      profile?: AuditProfile
      scopePaths?: readonly string[]
      sessionId?: string
    }): AuditRunHandle {
      const now = Date.now()
      const run: AuditRun = {
        id: `audit-${now.toString(36)}-${randomUUID().slice(0, 6)}`,
        title: input.title?.trim() || `安全审计 - ${input.repo}`,
        repo: input.repo,
        target: input.target,
        profile: input.profile ?? 'standard',
        scopePaths: sanitizePaths(input.scopePaths),
        ...(nonEmpty(input.sessionId) ? { sessionId: input.sessionId } : {}),
        phase: 'recon',
        runStatus: 'in_progress',
        units: [],
        findings: [],
        createdAt: now,
        updatedAt: now
      }
      const handle = register(run)
      emit({ type: 'run_created', runId: run.id })
      void persistRun(run)
      return handle
    },
    get(id: string): AuditRunHandle | undefined {
      return handles.get(id)
    },
    list(): readonly string[] {
      return newestFirst().map((run) => run.id)
    },
    latest(): AuditRunHandle | undefined {
      const first = newestFirst()[0]
      return first ? handles.get(first.id) : undefined
    },
    active(sessionId?: string): AuditRunHandle | undefined {
      const match = newestFirst().find(
        (run) =>
          run.runStatus === 'in_progress' &&
          (sessionId === undefined || run.sessionId === sessionId)
      )
      return match ? handles.get(match.id) : undefined
    },
    async flush(): Promise<void> {
      while (inflight.size > 0) {
        await Promise.all([...inflight.values()])
      }
    }
  }
}
