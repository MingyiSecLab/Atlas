import { AlertTriangle, Loader2, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Disclosure } from '../Disclosure'
import { ToolGroupTimeline } from './ToolGroupTimeline'
import type { ToolGroupSummary } from './types'

interface ToolGroupProps {
  summary: ToolGroupSummary
  defaultOpen?: boolean
}

export function ToolGroup({ summary, defaultOpen }: ToolGroupProps): React.ReactNode {
  // 如果正在运行且未明确指定，默认展开；完成后默认折叠
  const [isOpen, setIsOpen] = useState(() => {
    if (defaultOpen !== undefined) return defaultOpen
    return summary.status === 'running'
  })

  const icon = useMemo(() => {
    switch (summary.status) {
      case 'running':
        return <Loader2 size={14} className="aui-group-status-icon is-running aui-tool-spinner" />
      case 'error':
        return <AlertTriangle size={14} className="aui-group-status-icon is-error" />
      case 'success':
      default:
        return <Zap size={14} className="aui-group-status-icon is-success" />
    }
  }, [summary.status])

  const summaryText = useMemo(() => {
    const pills = summary.categoryPills?.join(' · ')
    if (pills) {
      return `${pills} (${summary.totalCount} 步)`
    }
    return `${summary.totalCount} 步`
  }, [summary.categoryPills, summary.totalCount])

  const tone = summary.status === 'error' ? 'error' : 'default'

  return (
    <div className="chat-tool-group-text-wrapper">
      <Disclosure
        open={isOpen}
        onToggle={() => setIsOpen((prev) => !prev)}
        icon={icon}
        title={summary.headline}
        summary={summaryText}
        running={summary.status === 'running'}
        tone={tone}
      >
        <ToolGroupTimeline
          steps={summary.steps}
          stats={summary.stats}
          isGroupRunning={summary.status === 'running'}
        />
      </Disclosure>
    </div>
  )
}
