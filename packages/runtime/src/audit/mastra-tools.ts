import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { RuntimeAuditService } from './types.js'

export interface AuditToolsOptions {
  /** 审计运行服务；缺省时工具以独立模式返回（不落库、不点亮面板）。 */
  auditService?: RuntimeAuditService & {
    subscribe?(listener: (event: unknown) => void): () => void
  }
}

/**
 * audit mode 的父编排器工具层（与 pentest 的 init/record 工具同构）：
 * - init_audit_run: 建立审计 run，激活右侧审计工作视图
 * - update_audit_ledger: 播种/更新覆盖台账单元（含状态机守卫）
 * - record_audit_finding: 录入结构化发现（confirmed/needs_validation/rejected 契约校验）
 */
export function createAuditMastraTools(options?: AuditToolsOptions) {
  // 活跃 run 句柄由工具闭包内解析（list() 取最新，避免跨闭包状态漂移）。
  const resolveRun = () => {
    const service = options?.auditService
    if (!service) return undefined
    return service.latest()
  }

  const initAuditRunTool = createTool({
    id: 'init_audit_run',
    description:
      '初始化代码审计 run 并激活右侧审计工作视图（覆盖台账 + 发现列表 + 待验证清单）。' +
      '进入完整审计模式、开始 Phase 1 侦察之前必须首先调用本工具。' +
      '参数：repo (必填仓库标识), target (必填审计目标仓库根路径), title (可选标题), ' +
      'profile (quick/standard/deep, 默认 standard), scopePaths (可选范围内相对路径列表)。',
    inputSchema: z.object({
      repo: z.string().describe('仓库稳定标识（目录名或 git remote 名）'),
      target: z.string().describe('审计目标的仓库根路径'),
      title: z.string().optional().describe('审计任务标题'),
      profile: z.enum(['quick', 'standard', 'deep']).optional().default('standard'),
      scopePaths: z.array(z.string()).optional().describe('范围内仓库相对路径（scoped run 时提供）')
    }),
    execute: async (inputData) => {
      const service = options?.auditService
      if (!service) {
        return JSON.stringify(
          {
            success: true,
            standalone: true,
            repo: inputData.repo,
            target: inputData.target,
            profile: inputData.profile,
            message: '审计上下文已就绪（独立模式，未接入审计服务）。'
          },
          null,
          2
        )
      }
      try {
        const run = service.create({
          repo: inputData.repo,
          target: inputData.target,
          ...(inputData.title ? { title: inputData.title } : {}),
          ...(inputData.profile ? { profile: inputData.profile } : {}),
          ...(inputData.scopePaths ? { scopePaths: inputData.scopePaths } : {})
        })
        return JSON.stringify(
          {
            success: true,
            runId: run.id,
            repo: inputData.repo,
            target: inputData.target,
            profile: inputData.profile ?? 'standard',
            phase: 'recon',
            runStatus: 'in_progress',
            message: `审计 run 已建立 [${run.id}]，右侧审计工作视图已激活。后续用 update_audit_ledger 播种覆盖台账，用 record_audit_finding 录入发现。`
          },
          null,
          2
        )
      } catch (error) {
        return JSON.stringify(
          { success: false, error: error instanceof Error ? error.message : String(error) },
          null,
          2
        )
      }
    }
  })

  const updateAuditLedgerTool = createTool({
    id: 'update_audit_ledger',
    description:
      '播种或更新审计覆盖台账单元，右侧覆盖矩阵实时刷新。两种用法：' +
      '(1) mode="seed"：Phase 1 结束后批量播种 planned 单元（每单元 = surface×boundary×subsystem×attackClass，coverageId 由源码派生引用用 :: 连接）；' +
      '(2) mode="update"：狩猎/验证过程中按单元更新状态与证据（状态机：planned→in_progress→covered|candidate|blocked，deferred/out_of_scope 需 reason 且不得带 owner）。',
    inputSchema: z.object({
      mode: z.enum(['seed', 'update']).describe('seed 批量播种；update 更新既有单元'),
      units: z
        .array(
          z.object({
            coverageId: z.string().describe('确定性覆盖单元 ID（派生引用 :: 连接，不含行号/agent/severity）'),
            surface: z.string().optional().describe('入口面'),
            boundary: z.string().optional().describe('信任边界'),
            subsystem: z.string().optional().describe('子系统'),
            attackClass: z.string().optional().describe('攻击类'),
            startingPaths: z.array(z.string()).optional().describe('仓库相对起点路径'),
            status: z
              .enum([
                'planned',
                'in_progress',
                'covered',
                'candidate',
                'blocked',
                'deferred',
                'not_applicable',
                'out_of_scope'
              ])
              .optional(),
            agentId: z.string().optional().describe('归属 agent 标识（小写，in_progress/covered/candidate/blocked 必填）'),
            reviewedPaths: z.array(z.string()).optional().describe('已审查路径（仓库相对）'),
            fingerprints: z.array(z.string()).optional().describe('关联的候选 fingerprint'),
            unresolved: z.array(z.string()).optional().describe('blocked 单元的未决事实'),
            reason: z.string().optional().describe('deferred / out_of_scope 的精确原因'),
            wave: z.number().optional().describe('狩猎轮次')
          })
        )
        .min(1)
        .max(500)
        .describe('单元列表')
    }),
    execute: async (inputData) => {
      const run = resolveRun()
      if (!run) {
        return JSON.stringify(
          { success: false, error: '未找到活跃的审计 run，请先调用 init_audit_run。' },
          null,
          2
        )
      }
      try {
        if (inputData.mode === 'seed') {
          const result = run.seedUnits(inputData.units)
          return JSON.stringify(
            {
              success: true,
              runId: run.id,
              seeded: result.seeded,
              rejected: result.rejected,
              message: `覆盖台账已播种 ${result.seeded} 个单元${result.rejected.length > 0 ? `，拒绝重复/非法 ID: ${result.rejected.join(', ')}` : ''}。`
            },
            null,
            2
          )
        }
        const updated: string[] = []
        const errors: Array<{ coverageId: string; error: string }> = []
        for (const unit of inputData.units) {
          try {
            const { coverageId, ...rest } = unit
            run.updateUnit(coverageId, rest)
            updated.push(coverageId)
          } catch (error) {
            errors.push({
              coverageId: unit.coverageId,
              error: error instanceof Error ? error.message : String(error)
            })
          }
        }
        return JSON.stringify(
          {
            success: errors.length === 0,
            runId: run.id,
            updated,
            errors,
            message: `台账更新 ${updated.length} 个单元${errors.length > 0 ? `，${errors.length} 个被状态机拒绝` : ''}。`
          },
          null,
          2
        )
      } catch (error) {
        return JSON.stringify(
          { success: false, error: error instanceof Error ? error.message : String(error) },
          null,
          2
        )
      }
    }
  })

  const recordAuditFindingTool = createTool({
    id: 'record_audit_finding',
    description:
      '录入一条结构化审计发现并同步至右侧发现列表 / 待验证清单。verdict 契约互斥：' +
      'confirmed 必填 severity + rootCause + observedResult + remediation；needs_validation 必填 blockers（至少一条）与验证计划；' +
      'rejected 必填 rejectionReason。同一 fingerprint 重复录入时更新原记录，不产生重复。',
    inputSchema: z.object({
      fingerprint: z.string().describe('源码派生的稳定指纹（不含行号/wave/agent/severity/verdict）'),
      title: z.string().describe('发现标题'),
      verdict: z.enum(['confirmed', 'needs_validation', 'rejected']),
      severity: z.enum(['critical', 'high', 'medium', 'low', 'informational']).optional(),
      description: z.string().optional().describe('技术细节与危害分析'),
      rootCause: z.string().optional().describe('confirmed：根因'),
      claimedRootCause: z.string().optional().describe('needs_validation/rejected：声称的根因'),
      trace: z
        .array(
          z.object({
            kind: z.enum(['entrypoint', 'propagation', 'sink']),
            path: z.string().describe('仓库相对路径'),
            line: z.number().optional(),
            detail: z.string()
          })
        )
        .optional()
        .describe('有序 trace：首项 entrypoint、末项 sink、中间 propagation'),
      evidence: z.array(z.string()).optional().describe('证据（仓库相对路径:行 或 本地检查结果）'),
      conditions: z.array(z.string()).optional().describe('confirmed：成立条件'),
      observedResult: z.string().optional().describe('confirmed：有界本地观测结果'),
      remediation: z.string().optional().describe('confirmed：最小源码修复与回归用例'),
      blockers: z.array(z.string()).optional().describe('needs_validation：精确 blocker'),
      validationPlanLocal: z.string().optional().describe('needs_validation：有界本地验证步骤'),
      validationPlanDeployment: z.string().optional().describe('needs_validation：owner-observed 检查'),
      rejectionReason: z.string().optional().describe('rejected：反驳理由'),
      coverageIds: z.array(z.string()).optional().describe('关联的覆盖单元 ID')
    }),
    execute: async (inputData) => {
      const run = resolveRun()
      if (!run) {
        return JSON.stringify(
          { success: false, error: '未找到活跃的审计 run，请先调用 init_audit_run。' },
          null,
          2
        )
      }
      try {
        const result = run.recordFinding(inputData)
        return JSON.stringify(
          {
            success: true,
            runId: run.id,
            findingId: result.id,
            fingerprint: inputData.fingerprint,
            verdict: inputData.verdict,
            message: `发现已记录 [${inputData.title}]（${inputData.verdict}），右侧面板已同步。`
          },
          null,
          2
        )
      } catch (error) {
        return JSON.stringify(
          { success: false, error: error instanceof Error ? error.message : String(error) },
          null,
          2
        )
      }
    }
  })

  const setAuditPhaseTool = createTool({
    id: 'set_audit_phase',
    description:
      '推进审计 run 的当前阶段并同步右侧阶段步进条。阶段：recon → hunting → candidate_validation → structured_output → record_verification → reporting；' +
      '结束 run 时用 set_audit_run_status（complete 或 incomplete + 精确原因）。',
    inputSchema: z.object({
      phase: z.enum([
        'recon',
        'hunting',
        'candidate_validation',
        'structured_output',
        'record_verification',
        'reporting'
      ])
    }),
    execute: async (inputData) => {
      const run = resolveRun()
      if (!run) {
        return JSON.stringify(
          { success: false, error: '未找到活跃的审计 run，请先调用 init_audit_run。' },
          null,
          2
        )
      }
      run.setPhase(inputData.phase)
      return JSON.stringify({
        success: true,
        runId: run.id,
        phase: inputData.phase,
        message: `阶段已推进至 ${inputData.phase}。`
      })
    }
  })

  const setAuditRunStatusTool = createTool({
    id: 'set_audit_run_status',
    description:
      '结束审计 run：complete（全部工件完成且校验通过）或 incomplete（附精确 incompleteReason，如 budget_cannot_fund_reconnaissance_and_reserves / critic_budget_exhausted / validation_budget_exhausted）。这是仅有的两个合法终态。',
    inputSchema: z.object({
      runStatus: z.enum(['complete', 'incomplete']),
      incompleteReason: z.string().optional().describe('incomplete 时的精确原因')
    }),
    execute: async (inputData) => {
      const run = resolveRun()
      if (!run) {
        return JSON.stringify(
          { success: false, error: '未找到活跃的审计 run，请先调用 init_audit_run。' },
          null,
          2
        )
      }
      try {
        run.setRunStatus(inputData.runStatus, inputData.incompleteReason)
        return JSON.stringify({
          success: true,
          runId: run.id,
          runStatus: inputData.runStatus,
          ...(inputData.incompleteReason ? { incompleteReason: inputData.incompleteReason } : {}),
          message: `审计 run 状态已置为 ${inputData.runStatus}。`
        })
      } catch (error) {
        return JSON.stringify(
          { success: false, error: error instanceof Error ? error.message : String(error) },
          null,
          2
        )
      }
    }
  })

  return {
    init_audit_run: initAuditRunTool,
    update_audit_ledger: updateAuditLedgerTool,
    record_audit_finding: recordAuditFindingTool,
    set_audit_phase: setAuditPhaseTool,
    set_audit_run_status: setAuditRunStatusTool
  }
}
