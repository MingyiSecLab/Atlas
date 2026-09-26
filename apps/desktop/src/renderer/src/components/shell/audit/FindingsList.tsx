import type { JSX } from 'react'
import { useMemo, useState } from 'react'
import type { AuditFinding, AuditSeverity } from '@mingyi/runtime'

const SEVERITY_ORDER: readonly (AuditSeverity | 'needs_validation' | 'rejected')[] = [
  'critical',
  'high',
  'medium',
  'low',
  'informational',
  'needs_validation',
  'rejected'
]

const SEVERITY_LABEL: Record<string, string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
  informational: '提示',
  needs_validation: '待验证',
  rejected: '已排除'
}

const TRACE_KIND_LABEL: Record<string, string> = {
  entrypoint: '入口',
  propagation: '传播',
  sink: '汇聚点'
}

function groupKey(finding: AuditFinding): AuditSeverity | 'needs_validation' | 'rejected' {
  if (finding.verdict === 'confirmed') return finding.severity ?? 'informational'
  return finding.verdict
}

/** 发现列表：severity 分组 + 可展开的 trace 证据链视图。 */
export function FindingsList({ findings }: { findings: readonly AuditFinding[] }): JSX.Element {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'needs_validation'>('all')

  const groups = useMemo(() => {
    const map = new Map<string, AuditFinding[]>()
    for (const finding of findings) {
      const key = groupKey(finding)
      if (filter === 'confirmed' && finding.verdict !== 'confirmed') continue
      if (filter === 'needs_validation' && finding.verdict !== 'needs_validation') continue
      const list = map.get(key) ?? []
      list.push(finding)
      map.set(key, list)
    }
    return SEVERITY_ORDER.filter((key) => (map.get(key)?.length ?? 0) > 0).map((key) => ({
      key,
      findings: map.get(key) ?? []
    }))
  }, [findings, filter])

  const toggle = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="audit-findings" data-testid="audit-findings">
      <div className="audit-findings-toolbar">
        <div className="audit-filter-tabs" role="tablist" aria-label="发现过滤">
          {(
            [
              ['all', '全部'],
              ['confirmed', '已确认'],
              ['needs_validation', '待验证']
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`audit-filter-tab ${filter === value ? 'is-active' : ''}`}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="audit-empty">暂无发现记录。</div>
      ) : (
        <div className="audit-findings-scroll">
          {groups.map(({ key, findings: groupFindings }) => (
            <section key={key} className="audit-finding-group">
              <div className={`audit-finding-group-header is-${key}`}>
                {SEVERITY_LABEL[key] ?? key}
                <span className="audit-finding-group-count">{groupFindings.length}</span>
              </div>
              <ul className="audit-finding-list">
                {groupFindings.map((finding) => {
                  const isOpen = expanded.has(finding.id)
                  return (
                    <li key={finding.id} className={`audit-finding is-${finding.verdict}`}>
                      <button
                        type="button"
                        className="audit-finding-header"
                        aria-expanded={isOpen}
                        onClick={() => toggle(finding.id)}
                      >
                        <span className={`audit-finding-severity is-${groupKey(finding)}`}>
                          {SEVERITY_LABEL[groupKey(finding)] ?? finding.verdict}
                        </span>
                        <span className="audit-finding-title">{finding.title}</span>
                      </button>
                      {isOpen ? (
                        <div className="audit-finding-detail">
                          <div className="audit-finding-fp" title={finding.fingerprint}>
                            {finding.fingerprint}
                          </div>
                          {finding.description ? (
                            <p className="audit-finding-desc">{finding.description}</p>
                          ) : null}
                          {finding.trace.length > 0 ? (
                            <ol className="audit-trace">
                              {finding.trace.map((step, index) => (
                                <li
                                  key={`${finding.id}-${index}`}
                                  className={`audit-trace-step is-${step.kind}`}
                                >
                                  <span className="audit-trace-kind">
                                    {TRACE_KIND_LABEL[step.kind] ?? step.kind}
                                  </span>
                                  <span className="audit-trace-path">
                                    {step.path}
                                    {step.line ? `:${step.line}` : ''}
                                  </span>
                                  {step.detail ? (
                                    <span className="audit-trace-detail">{step.detail}</span>
                                  ) : null}
                                </li>
                              ))}
                            </ol>
                          ) : null}
                          {finding.observedResult ? (
                            <div className="audit-finding-row">
                              <span className="audit-row-label">观测结果</span>
                              <span>{finding.observedResult}</span>
                            </div>
                          ) : null}
                          {finding.remediation ? (
                            <div className="audit-finding-row">
                              <span className="audit-row-label">最小修复</span>
                              <span>{finding.remediation}</span>
                            </div>
                          ) : null}
                          {finding.blockers && finding.blockers.length > 0 ? (
                            <div className="audit-finding-row">
                              <span className="audit-row-label">阻塞项</span>
                              <ul className="audit-blockers">
                                {finding.blockers.map((blocker, index) => (
                                  <li key={index}>{blocker}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {finding.rejectionReason ? (
                            <div className="audit-finding-row">
                              <span className="audit-row-label">排除理由</span>
                              <span>{finding.rejectionReason}</span>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
