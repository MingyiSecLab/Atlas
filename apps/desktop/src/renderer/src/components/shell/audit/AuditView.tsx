import type { JSX } from 'react'
import { useState } from 'react'
import type { AuditPhase } from '@mingyi/runtime'
import { useAuditRun } from './use-audit-run'
import { CoverageMatrix } from './CoverageMatrix'
import { FindingsList } from './FindingsList'
import { ValidationList } from './ValidationList'

const PHASES: ReadonlyArray<{ id: AuditPhase; label: string }> = [
  { id: 'recon', label: '侦察' },
  { id: 'hunting', label: '狩猎' },
  { id: 'candidate_validation', label: '验证' },
  { id: 'structured_output', label: '输出' },
  { id: 'record_verification', label: '复核' },
  { id: 'reporting', label: '报告' }
]

const PROFILE_LABEL: Record<string, string> = {
  quick: '快速',
  standard: '标准',
  deep: '深度'
}

const STATUS_LABEL: Record<string, string> = {
  in_progress: '进行中',
  complete: '已完成',
  incomplete: '不完整'
}

type AuditTab = 'coverage' | 'findings' | 'validation'

/**
 * 右侧审计工作视图：Run 头部 + 阶段步进条 + 覆盖矩阵 / 发现 / 待验证三视图。
 * 数据由 audit mode 父编排器经审计工具实时写入 Runtime 审计服务。
 */
export function AuditView(): JSX.Element {
  const { snapshot, runIds, activeRunId, loading, error, selectRun, dismissError } = useAuditRun()
  const [tab, setTab] = useState<AuditTab>('coverage')

  const phaseIndex = snapshot ? PHASES.findIndex((phase) => phase.id === snapshot.phase) : -1

  return (
    <div className="audit-view" data-testid="audit-view">
      {error ? (
        <div className="audit-error" role="alert">
          {error.message}
          <button type="button" onClick={dismissError} aria-label="关闭错误提示">
            ×
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="audit-empty">正在加载审计运行…</div>
      ) : !snapshot ? (
        <div className="audit-empty">
          暂无审计运行。在对话中让 Atlas 进入完整审计模式，它会调用 init_audit_run
          建立运行并点亮此视图。
        </div>
      ) : (
        <>
          <header className="audit-run-header">
            <div className="audit-run-title-row">
              <span className="audit-run-title">{snapshot.title}</span>
              <span className={`audit-run-status is-${snapshot.runStatus}`}>
                {STATUS_LABEL[snapshot.runStatus] ?? snapshot.runStatus}
              </span>
            </div>
            <div className="audit-run-meta">
              <span title={snapshot.target}>{snapshot.repo}</span>
              <span>·</span>
              <span>{PROFILE_LABEL[snapshot.profile] ?? snapshot.profile}</span>
              {runIds.length > 1 ? (
                <>
                  <span>·</span>
                  <select
                    className="audit-run-select"
                    aria-label="选择审计运行"
                    value={activeRunId ?? undefined}
                    onChange={(event) => void selectRun(event.target.value)}
                  >
                    {runIds.map((runId) => (
                      <option key={runId} value={runId}>
                        {runId}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
            </div>
            {snapshot.runStatus === 'incomplete' && snapshot.incompleteReason ? (
              <div className="audit-run-incomplete" title={snapshot.incompleteReason}>
                未完成原因：{snapshot.incompleteReason}
              </div>
            ) : null}
            <nav className="audit-phase-stepper" aria-label="审计阶段">
              {PHASES.map((phase, index) => (
                <span
                  key={phase.id}
                  className={`audit-phase${index === phaseIndex ? ' is-active' : ''}${index < phaseIndex ? ' is-done' : ''}`}
                >
                  {phase.label}
                </span>
              ))}
            </nav>
          </header>

          <div className="audit-tabs" role="tablist" aria-label="审计视图">
            {(
              [
                ['coverage', '覆盖'],
                [
                  'findings',
                  `发现 ${snapshot.findings.filter((f) => f.verdict !== 'needs_validation').length}`
                ],
                [
                  'validation',
                  `待验证 ${snapshot.findings.filter((f) => f.verdict === 'needs_validation').length}`
                ]
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                className={`audit-tab ${tab === value ? 'is-active' : ''}`}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="audit-tab-content">
            {tab === 'coverage' ? <CoverageMatrix units={snapshot.units} /> : null}
            {tab === 'findings' ? <FindingsList findings={snapshot.findings} /> : null}
            {tab === 'validation' ? <ValidationList findings={snapshot.findings} /> : null}
          </div>
        </>
      )}
    </div>
  )
}
