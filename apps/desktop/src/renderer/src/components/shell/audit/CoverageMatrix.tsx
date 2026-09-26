import type { JSX } from 'react'
import { useMemo, useState } from 'react'
import type { AuditCoverageUnit, AuditUnitStatus } from '@mingyi/runtime'

const UNIT_STATUS_ORDER: readonly AuditUnitStatus[] = [
  'candidate',
  'in_progress',
  'covered',
  'blocked',
  'deferred',
  'planned',
  'out_of_scope',
  'not_applicable'
]

const UNIT_STATUS_LABEL: Record<AuditUnitStatus, string> = {
  candidate: '候选',
  in_progress: '进行中',
  covered: '已覆盖',
  blocked: '受阻',
  deferred: '延期',
  planned: '待分配',
  out_of_scope: '范围外',
  not_applicable: '不适用'
}

/**
 * 覆盖矩阵：按子系统分组的覆盖单元树。
 *
 * 诚实性原则的可视化：deferred / blocked 与 covered 同等显眼，
 * 禁止把"没审到"折叠成"已覆盖"。
 */
export function CoverageMatrix({ units }: { units: readonly AuditCoverageUnit[] }): JSX.Element {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

  const counts = useMemo(() => {
    const map = new Map<AuditUnitStatus, number>()
    for (const unit of units) {
      map.set(unit.status, (map.get(unit.status) ?? 0) + 1)
    }
    return map
  }, [units])

  const groups = useMemo(() => {
    const bySubsystem = new Map<string, AuditCoverageUnit[]>()
    for (const unit of units) {
      const key = unit.subsystem || '(未分类)'
      const list = bySubsystem.get(key) ?? []
      list.push(unit)
      bySubsystem.set(key, list)
    }
    return [...bySubsystem.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([subsystem, list]) => ({
        subsystem,
        units: [...list].sort(
          (a, b) =>
            UNIT_STATUS_ORDER.indexOf(a.status) - UNIT_STATUS_ORDER.indexOf(b.status) ||
            a.coverageId.localeCompare(b.coverageId)
        )
      }))
  }, [units])

  const toggle = (subsystem: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(subsystem)) {
        next.delete(subsystem)
      } else {
        next.add(subsystem)
      }
      return next
    })
  }

  return (
    <div className="audit-coverage" data-testid="audit-coverage">
      <div className="audit-coverage-counts" role="status">
        {UNIT_STATUS_ORDER.filter((status) => (counts.get(status) ?? 0) > 0).map((status) => (
          <span key={status} className={`audit-count-chip is-${status}`}>
            {UNIT_STATUS_LABEL[status]} {counts.get(status) ?? 0}
          </span>
        ))}
        <span className="audit-count-total">
          {units.length} 单元 · 覆盖率{' '}
          {units.length > 0
            ? `${Math.round((((counts.get('covered') ?? 0) + (counts.get('candidate') ?? 0)) / units.length) * 100)}%`
            : '—'}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="audit-empty">覆盖台账尚未播种（等待 Phase 1 侦察完成）。</div>
      ) : (
        <div className="audit-coverage-groups">
          {groups.map(({ subsystem, units: groupUnits }) => {
            const isCollapsed = collapsed.has(subsystem)
            const groupCounts = new Map<AuditUnitStatus, number>()
            for (const unit of groupUnits) {
              groupCounts.set(unit.status, (groupCounts.get(unit.status) ?? 0) + 1)
            }
            return (
              <section key={subsystem} className="audit-coverage-group">
                <button
                  type="button"
                  className="audit-group-header"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggle(subsystem)}
                >
                  <span className="audit-group-name">{subsystem}</span>
                  <span className="audit-group-meta">
                    {UNIT_STATUS_ORDER.filter((s) => (groupCounts.get(s) ?? 0) > 0)
                      .map((s) => `${UNIT_STATUS_LABEL[s]} ${groupCounts.get(s)}`)
                      .join(' · ')}
                  </span>
                </button>
                {isCollapsed ? null : (
                  <ul className="audit-unit-list">
                    {groupUnits.map((unit) => (
                      <li key={unit.coverageId} className={`audit-unit is-${unit.status}`}>
                        <div className="audit-unit-main">
                          <span className={`audit-unit-chip is-${unit.status}`}>
                            {UNIT_STATUS_LABEL[unit.status]}
                          </span>
                          <div className="audit-unit-text">
                            <div className="audit-unit-surface" title={unit.coverageId}>
                              {unit.surface}
                              {unit.attackClass ? (
                                <span className="audit-unit-class"> · {unit.attackClass}</span>
                              ) : null}
                            </div>
                            <div className="audit-unit-boundary">{unit.boundary}</div>
                          </div>
                        </div>
                        <div className="audit-unit-detail">
                          {unit.agentId ? (
                            <span className="audit-unit-agent">{unit.agentId}</span>
                          ) : null}
                          {unit.fingerprints.length > 0 ? (
                            <span className="audit-unit-fp">{unit.fingerprints.length} 候选</span>
                          ) : null}
                          {unit.reviewedPaths.length > 0 ? (
                            <span
                              className="audit-unit-paths"
                              title={unit.reviewedPaths.join('\n')}
                            >
                              {unit.reviewedPaths.length} 路径
                            </span>
                          ) : null}
                          {unit.unresolved.length > 0 ? (
                            <span
                              className="audit-unit-unresolved"
                              title={unit.unresolved.join('\n')}
                            >
                              {unit.unresolved.length} 未决
                            </span>
                          ) : null}
                          {unit.reason ? (
                            <span className="audit-unit-reason" title={unit.reason}>
                              {unit.reason}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
