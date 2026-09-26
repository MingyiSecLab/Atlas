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
  type AuditUnitStatus,
  type RuntimeAuditRunHandle as AuditRunHandle,
  type RuntimeAuditService
} from './types.js'

export interface RuntimeAuditServiceOptions {
  store?: RuntimeAuditStore
}

const UNIT_TERMINAL_NO_OWNER: ReadonlySet<AuditUnitStatus> = new Set([
  'planned',
  'deferred',
  'not_applicable',
  'out_of_scope'
])

function sanitizePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim())
    .slice(0, 200)
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

  constructor(
    run: AuditRun,
    persist: () => Promise<void>,
    emit: (event: AuditEvent) => void
  ) {
    this.id = run.id
    this.run = run
    this.persist = persist
    this.emit = emit
  }

  snapshot(): AuditRunSnapshot {
    return JSON.parse(JSON.stringify(this.run)) as AuditRunSnapshot
  }

  setPhase(phase: AuditPhase): void {
    this.run.phase = phase
    this.run.updatedAt = Date.now()
    this.emit({ type: 'phase_changed', runId: this.run.id, phase })
    void this.persist()
  }

  setRunStatus(runStatus: AuditRun['runStatus'], incompleteReason?: string): void {
    this.run.runStatus = runStatus
    this.run.incompleteReason =
      runStatus === 'incomplete' ? (incompleteReason ?? 'unspecified') : undefined
    this.run.updatedAt = Date.now()
    this.emit({ type: 'status_changed', runId: this.run.id, runStatus })
    void this.persist()
  }

  seedUnits(
    units: ReadonlyArray<Partial<AuditCoverageUnit> & { coverageId: string }>
  ): { seeded: number; rejected: string[] } {
    const existing = new Set(this.run.units.map((unit) => unit.coverageId))
    const rejected: string[] = []
    let seeded = 0
    for (const input of units) {
      const coverageId = input.coverageId?.trim()
      if (!coverageId || existing.has(coverageId)) {
        rejected.push(coverageId || '<empty>')
        continue
      }
      const now = Date.now()
      this.run.units = [
        ...this.run.units,
        {
          coverageId,
          surface: input.surface ?? coverageId,
          boundary: input.boundary ?? '',
          subsystem: input.subsystem ?? '',
          attackClass: input.attackClass ?? '',
          startingPaths: sanitizePaths(input.startingPaths),
          status: input.status ?? 'planned',
          agentId: input.agentId ?? null,
          reviewedPaths: sanitizePaths(input.reviewedPaths),
          checks: input.checks ?? [],
          fingerprints: sanitizePaths(input.fingerprints),
          unresolved: sanitizePaths(input.unresolved),
          wave: input.wave ?? 1,
          ...(input.reason ? { reason: input.reason } : {}),
          updatedAt: now
        }
      ]
      existing.add(coverageId)
      seeded += 1
      this.emit({ type: 'unit_updated', runId: this.run.id, coverageId })
    }
    if (seeded > 0) {
      this.run.updatedAt = Date.now()
      this.emit({ type: 'run_updated', runId: this.run.id })
      void this.persist()
    }
    return { seeded, rejected }
  }

  updateUnit(
    coverageId: string,
    patch: Partial<Omit<AuditCoverageUnit, 'coverageId' | 'updatedAt'>>
  ): void {
    const index = this.run.units.findIndex((unit) => unit.coverageId === coverageId)
    if (index < 0) {
      throw new AuditRunError(`Unknown coverage unit: ${coverageId}`)
    }
    const current = this.run.units[index]
    if (!current) {
      throw new AuditRunError(`Unknown coverage unit: ${coverageId}`)
    }
    const nextStatus = (patch.status ?? current.status) as AuditUnitStatus
    const nextAgentId = patch.agentId !== undefined ? patch.agentId : current.agentId

    // 状态机守卫：无归属终态不允许携带 owner；owner 态必须声明归属。
    if (UNIT_TERMINAL_NO_OWNER.has(nextStatus) && nextAgentId && nextStatus !== 'planned') {
      throw new AuditRunError(
        `Unit ${coverageId}: status ${nextStatus} must not carry an owner agent.`
      )
    }
    if (
      (nextStatus === 'in_progress' || nextStatus === 'covered' || nextStatus === 'candidate' || nextStatus === 'blocked') &&
      !nextAgentId
    ) {
      throw new AuditRunError(
        `Unit ${coverageId}: status ${nextStatus} requires an owner agentId.`
      )
    }

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
      ...(patch.unresolved !== undefined
        ? { unresolved: sanitizePaths(patch.unresolved) }
        : {}),
      ...(patch.wave !== undefined ? { wave: patch.wave } : {}),
      ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
      updatedAt: Date.now()
    }
    const units = [...this.run.units]
    units[index] = next
    this.run.units = units
    this.run.updatedAt = Date.now()
    this.emit({ type: 'unit_updated', runId: this.run.id, coverageId })
    void this.persist()
  }

  recordFinding(
    input: Partial<Omit<AuditFinding, 'id' | 'recordedAt' | 'updatedAt'>> & {
      fingerprint: string
      title: string
      verdict: AuditFinding['verdict']
    }
  ): { id: string } {
    if (!input.fingerprint?.trim()) {
      throw new AuditRunError('Finding requires a stable fingerprint.')
    }
    if (input.verdict === 'confirmed' && !input.severity) {
      throw new AuditRunError('Confirmed finding requires a severity.')
    }
    if (input.verdict === 'needs_validation' && !input.blockers?.length) {
      throw new AuditRunError('needs_validation finding requires at least one blocker.')
    }
    if (input.verdict === 'rejected' && !input.rejectionReason?.trim()) {
      throw new AuditRunError('rejected finding requires a rejection reason.')
    }
    const existing = this.run.findings.find(
      (finding) => finding.fingerprint === input.fingerprint
    )
    const now = Date.now()
    if (existing) {
      Object.assign(existing, input, { updatedAt: now })
      this.run.updatedAt = now
      this.emit({ type: 'finding_recorded', runId: this.run.id, findingId: existing.id })
      void this.persist()
      return { id: existing.id }
    }
    const finding: AuditFinding = {
      id: `finding-${randomUUID().slice(0, 8)}`,
      fingerprint: input.fingerprint,
      title: input.title,
      verdict: input.verdict,
      ...(input.severity ? { severity: input.severity } : {}),
      description: input.description ?? '',
      ...(input.rootCause ? { rootCause: input.rootCause } : {}),
      ...(input.claimedRootCause ? { claimedRootCause: input.claimedRootCause } : {}),
      trace: input.trace ?? [],
      evidence: input.evidence ?? [],
      ...(input.conditions ? { conditions: input.conditions } : {}),
      ...(input.observedResult ? { observedResult: input.observedResult } : {}),
      ...(input.remediation ? { remediation: input.remediation } : {}),
      ...(input.blockers ? { blockers: input.blockers } : {}),
      ...(input.validationPlanLocal ? { validationPlanLocal: input.validationPlanLocal } : {}),
      ...(input.validationPlanDeployment
        ? { validationPlanDeployment: input.validationPlanDeployment }
        : {}),
      ...(input.rejectionReason ? { rejectionReason: input.rejectionReason } : {}),
      coverageIds: input.coverageIds ?? [],
      recordedAt: now,
      updatedAt: now
    }
    this.run.findings = [...this.run.findings, finding]
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

  const emit = (event: AuditEvent): void => {
    for (const listener of listeners) {
      try {
        listener(event)
      } catch {
        // 监听器异常不阻塞审计状态推进。
      }
    }
  }

  const persistRun = async (run: AuditRun): Promise<void> => {
    try {
      await store.save(run)
    } catch {
      // 持久化失败不阻塞内存权威状态；下次变更会重试写入。
    }
  }

  const ready = store.load().then((loaded) => {
    for (const run of loaded) {
      if (!runs.has(run.id)) {
        runs.set(run.id, run)
        handles.set(
          run.id,
          new AuditRunHandleImpl(run, () => persistRun(run), emit)
        )
      }
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
    }): AuditRunHandle {
      const now = Date.now()
      const run: AuditRun = {
        id: `audit-${now.toString(36)}-${randomUUID().slice(0, 6)}`,
        title: input.title?.trim() || `安全审计 - ${input.repo}`,
        repo: input.repo,
        target: input.target,
        profile: input.profile ?? 'standard',
        scopePaths: sanitizePaths(input.scopePaths),
        phase: 'recon',
        runStatus: 'in_progress',
        units: [],
        findings: [],
        createdAt: now,
        updatedAt: now
      }
      runs.set(run.id, run)
      const handle = new AuditRunHandleImpl(run, () => persistRun(run), emit)
      handles.set(run.id, handle)
      emit({ type: 'run_created', runId: run.id })
      void persistRun(run)
      return handle
    },
    get(id: string): AuditRunHandle | undefined {
      return handles.get(id)
    },
    list(): readonly string[] {
      return [...runs.values()]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((run) => run.id)
    },
    latest(): AuditRunHandle | undefined {
      const ids = [...runs.values()].sort((a, b) => b.createdAt - a.createdAt)
      const first = ids[0]
      return first ? handles.get(first.id) : undefined
    }
  }
}
