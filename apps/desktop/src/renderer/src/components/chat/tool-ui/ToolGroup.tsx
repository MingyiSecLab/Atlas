import { AlertTriangle, ChevronDown, Loader2, Zap } from 'lucide-react'
import { useState } from 'react'
import { ToolGroupTimeline } from './ToolGroupTimeline'
import type { ToolGroupSummary } from './types'

interface ToolGroupProps {
  summary: ToolGroupSummary
  defaultOpen?: boolean
}

export function ToolGroup({ summary, defaultOpen }: ToolGroupProps): React.ReactNode {
  // 如果是正在运行状态且未明确指定 defaultOpen，默认展开方便用户实时观察；完成后默认折叠
  const [isOpen, setIsOpen] = useState(() => {
    if (defaultOpen !== undefined) return defaultOpen
    return summary.status === 'running'
  })

  const getStatusIcon = (): React.ReactNode => {
    switch (summary.status) {
      case 'running':
        return <Loader2 size={15} className="aui-group-status-icon is-running aui-tool-spinner" />
      case 'error':
        return <AlertTriangle size={15} className="aui-group-status-icon is-error" />
      case 'success':
      default:
        return <Zap size={14} className="aui-group-status-icon is-success" />
    }
  }

  return (
    <div
      className={`aui-tool-group status-${summary.status} ${isOpen ? 'is-open' : 'is-collapsed'}`}
      data-status={summary.status}
      data-step-count={summary.totalCount}
    >
      {/* 聚合状态栏 Header */}
      <div
        className="aui-group-header"
        onClick={() => setIsOpen((prev) => !prev)}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsOpen((prev) => !prev)
          }
        }}
      >
        <div className="aui-group-header-left">
          <span className="aui-group-icon-bubble">{getStatusIcon()}</span>

          <div className="aui-group-info">
            <span className="aui-group-headline">{summary.headline}</span>

            {/* 工具分类药丸列表 */}
            {summary.categoryPills && summary.categoryPills.length > 0 ? (
              <div className="aui-group-pills">
                {summary.categoryPills.map((pill) => (
                  <span key={pill} className="aui-group-pill">
                    {pill}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="aui-group-header-right">
          <span className="aui-group-count-badge">{summary.totalCount} 步</span>
          <span className={`aui-group-chevron ${isOpen ? 'is-expanded' : ''}`}>
            <ChevronDown size={15} />
          </span>
        </div>
      </div>

      {/* 展开的时间线面板 */}
      {isOpen ? (
        <div className="aui-group-body">
          <ToolGroupTimeline steps={summary.steps} isGroupRunning={summary.status === 'running'} />
        </div>
      ) : null}
    </div>
  )
}
