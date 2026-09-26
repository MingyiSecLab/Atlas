import type { JSX } from 'react'
import type { AuditFinding } from '@mingyi/runtime'

/**
 * 待验证清单（needs_validation 线索队列）：无 severity 的优先行动项，
 * 展示精确 blocker 与 local / owner-observed 双通道验证计划。
 */
export function ValidationList({ findings }: { findings: readonly AuditFinding[] }): JSX.Element {
  const leads = findings.filter((finding) => finding.verdict === 'needs_validation')

  return (
    <div className="audit-validation" data-testid="audit-validation">
      {leads.length === 0 ? (
        <div className="audit-empty">暂无待验证线索。</div>
      ) : (
        <ul className="audit-validation-list">
          {leads.map((lead) => (
            <li key={lead.id} className="audit-validation-item">
              <div className="audit-validation-title">{lead.title}</div>
              <div className="audit-finding-fp" title={lead.fingerprint}>
                {lead.fingerprint}
              </div>
              {lead.description ? <p className="audit-finding-desc">{lead.description}</p> : null}
              {lead.trace.length > 0 ? (
                <div className="audit-validation-trace">
                  {lead.trace.map((step, index) => (
                    <span key={index} className="audit-validation-step" title={step.detail}>
                      {step.path}
                      {step.line ? `:${step.line}` : ''}
                    </span>
                  ))}
                </div>
              ) : null}
              {lead.blockers && lead.blockers.length > 0 ? (
                <div className="audit-finding-row">
                  <span className="audit-row-label">阻塞项</span>
                  <ul className="audit-blockers">
                    {lead.blockers.map((blocker, index) => (
                      <li key={index}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {lead.validationPlanLocal ? (
                <div className="audit-finding-row">
                  <span className="audit-row-label">本地下一步</span>
                  <span>{lead.validationPlanLocal}</span>
                </div>
              ) : null}
              {lead.validationPlanDeployment ? (
                <div className="audit-finding-row">
                  <span className="audit-row-label">Owner 观测</span>
                  <span>{lead.validationPlanDeployment}</span>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
