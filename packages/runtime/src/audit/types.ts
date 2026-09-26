/**
 * 代码审计（audit mode）运行域模型。
 *
 * 提炼自 security-audit skill：一次审计 run 由覆盖台账（coverage ledger）、
 * 结构化发现（findings）与阶段状态组成；父编排器（audit mode）通过
 * init_audit_run / update_audit_ledger / record_audit_finding 三个工具
 * 驱动本服务，右侧面板通过 IPC 读取快照实时呈现。
 */

/** 审计六阶段（与 auditMode 编排指令一一对应）。 */
export type AuditPhase =
  | 'recon'
  | 'hunting'
  | 'candidate_validation'
  | 'structured_output'
  | 'record_verification'
  | 'reporting'

export const AUDIT_PHASES: readonly AuditPhase[] = [
  'recon',
  'hunting',
  'candidate_validation',
  'structured_output',
  'record_verification',
  'reporting'
]

/** run 级状态：complete / incomplete（含精确原因）是仅有的两个合法终态。 */
export type AuditRunStatus = 'in_progress' | 'complete' | 'incomplete'

export type AuditProfile = 'quick' | 'standard' | 'deep'

/** 覆盖台账单元状态机（与 skill RECONNAISSANCE.md 状态表一致）。 */
export type AuditUnitStatus =
  | 'planned'
  | 'in_progress'
  | 'covered'
  | 'candidate'
  | 'blocked'
  | 'deferred'
  | 'not_applicable'
  | 'out_of_scope'

/** 单元内一次检查（hunter 或 verifier 的 source/local 检查）。 */
export interface AuditUnitCheck {
  /** 执行该检查的 canonical agent 标识。 */
  agentId: string
  invariant: string
  method: 'source' | 'local'
  result: string
  /** local 检查的产物引用；source 检查为 null。 */
  artifact?: string | null
}

/** 覆盖台账单元：入口面 × 信任边界 × 子系统 × 攻击类 的确定性组合。 */
export interface AuditCoverageUnit {
  coverageId: string
  surface: string
  boundary: string
  subsystem: string
  attackClass: string
  startingPaths: readonly string[]
  status: AuditUnitStatus
  /** 分配归属（canonical lowercase agent id）；未分配为 null。 */
  agentId: string | null
  reviewedPaths: readonly string[]
  checks: readonly AuditUnitCheck[]
  /** 本单元关联的候选/发现 fingerprint。 */
  fingerprints: readonly string[]
  /** blocked 单元的未决事实。 */
  unresolved: readonly string[]
  wave: number
  /** deferred / out_of_scope 的精确原因。 */
  reason?: string
  updatedAt: number
}

/** trace 步骤：多步时首项 entrypoint、末项 sink、中间 propagation。 */
export interface AuditTraceStep {
  kind: 'entrypoint' | 'propagation' | 'sink'
  /** 仓库相对路径。 */
  path: string
  line?: number
  detail: string
}

export type AuditVerdict = 'confirmed' | 'needs_validation' | 'rejected'

export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low' | 'informational'

/** 结构化发现记录；字段契约随 verdict 互斥（与 skill report-schema 对齐）。 */
export interface AuditFinding {
  id: string
  fingerprint: string
  title: string
  verdict: AuditVerdict
  /** 仅 confirmed。 */
  severity?: AuditSeverity
  description: string
  rootCause?: string
  claimedRootCause?: string
  trace: readonly AuditTraceStep[]
  evidence: readonly string[]
  conditions?: readonly string[]
  observedResult?: string
  remediation?: string
  /** 仅 needs_validation。 */
  blockers?: readonly string[]
  validationPlanLocal?: string
  validationPlanDeployment?: string
  /** 仅 rejected。 */
  rejectionReason?: string
  coverageIds: readonly string[]
  recordedAt: number
  updatedAt: number
}

export interface AuditRun {
  id: string
  title: string
  repo: string
  target: string
  profile: AuditProfile
  scopePaths: readonly string[]
  phase: AuditPhase
  runStatus: AuditRunStatus
  incompleteReason?: string
  units: readonly AuditCoverageUnit[]
  findings: readonly AuditFinding[]
  createdAt: number
  updatedAt: number
}

/** 面板与工具共享的 run 只读快照。 */
export type AuditRunSnapshot = AuditRun

export type AuditEvent =
  | { type: 'run_created'; runId: string }
  | { type: 'run_updated'; runId: string }
  | { type: 'unit_updated'; runId: string; coverageId: string }
  | { type: 'finding_recorded'; runId: string; findingId: string }
  | { type: 'phase_changed'; runId: string; phase: AuditPhase }
  | { type: 'status_changed'; runId: string; runStatus: AuditRunStatus }

export interface RuntimeAuditStore {
  load(): Promise<readonly AuditRun[]>
  save(run: AuditRun): Promise<void>
}

/** 单个 run 的写句柄。 */
export interface RuntimeAuditRunHandle {
  readonly id: string
  snapshot(): AuditRunSnapshot
  setPhase(phase: AuditPhase): void
  setRunStatus(runStatus: AuditRunStatus, incompleteReason?: string): void
  seedUnits(
    units: ReadonlyArray<Partial<AuditCoverageUnit> & { coverageId: string }>
  ): { seeded: number; rejected: string[] }
  updateUnit(
    coverageId: string,
    patch: Partial<Omit<AuditCoverageUnit, 'coverageId' | 'updatedAt'>>
  ): void
  recordFinding(
    input: Partial<Omit<AuditFinding, 'id' | 'recordedAt' | 'updatedAt'>> & {
      fingerprint: string
      title: string
      verdict: AuditVerdict
    }
  ): { id: string }
}

export interface RuntimeAuditService {
  create(input: {
    title?: string
    repo: string
    target: string
    profile?: AuditProfile
    scopePaths?: readonly string[]
  }): RuntimeAuditRunHandle
  get(id: string): RuntimeAuditRunHandle | undefined
  list(): readonly string[]
  latest(): RuntimeAuditRunHandle | undefined
  /** 订阅全部 run 的变更事件（Desktop IPC 广播用）。 */
  subscribe(listener: (event: AuditEvent) => void): () => void
  ready: Promise<void>
}

export class AuditRunError extends Error {}
