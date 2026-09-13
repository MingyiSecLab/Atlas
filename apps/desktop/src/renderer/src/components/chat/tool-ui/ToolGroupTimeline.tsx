import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileCode,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench
} from 'lucide-react'
import { useState } from 'react'
import { DefaultToolUI } from './DefaultToolUI'
import { FileOpToolUI } from './FileOpToolUI'
import { PentestToolUI } from './PentestToolUI'
import { SearchToolUI } from './SearchToolUI'
import { TerminalToolUI } from './TerminalToolUI'
import { ToolStatusBadge } from './ToolStatusBadge'
import type { ToolGroupStep } from './types'

interface ToolGroupTimelineProps {
  steps: ToolGroupStep[]
  isGroupRunning: boolean
}

export function ToolGroupTimeline({ steps }: ToolGroupTimelineProps): React.ReactNode {
  // 默认记录哪些 step 被单独展开了
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    // 如果有正在运行或失败的步骤，默认展开该步骤
    steps.forEach((step) => {
      if (step.toolBlock.status === 'running' || step.toolBlock.status === 'error') {
        initial[step.id] = true
      }
    })
    return initial
  })

  const toggleStep = (stepId: string): void => {
    setExpandedSteps((prev) => ({
      ...prev,
      [stepId]: !prev[stepId]
    }))
  }

  const getStepIcon = (step: ToolGroupStep): React.ReactNode => {
    const status = step.toolBlock.status
    if (status === 'running') {
      return <Loader2 size={13} className="aui-step-status-icon is-running aui-tool-spinner" />
    }
    if (status === 'error' || status === 'denied') {
      return <AlertCircle size={13} className="aui-step-status-icon is-error" />
    }
    if (status === 'success') {
      return <CheckCircle2 size={13} className="aui-step-status-icon is-success" />
    }
    return <Clock size={13} className="aui-step-status-icon is-pending" />
  }

  const getCategoryMiniIcon = (category: string): React.ReactNode => {
    switch (category) {
      case 'terminal':
        return <Terminal size={12} className="aui-step-cat-icon is-terminal" />
      case 'file_op':
        return <FileCode size={12} className="aui-step-cat-icon is-file" />
      case 'search':
        return <Search size={12} className="aui-step-cat-icon is-search" />
      case 'security':
        return <ShieldCheck size={12} className="aui-step-cat-icon is-security" />
      default:
        return <Wrench size={12} className="aui-step-cat-icon is-general" />
    }
  }

  const renderStepBody = (step: ToolGroupStep): React.ReactNode => {
    switch (step.parsed.category) {
      case 'terminal':
        return <TerminalToolUI block={step.toolBlock} parsed={step.parsed} />
      case 'file_op':
        return <FileOpToolUI block={step.toolBlock} parsed={step.parsed} />
      case 'search':
        return <SearchToolUI block={step.toolBlock} parsed={step.parsed} />
      case 'security':
        return <PentestToolUI block={step.toolBlock} parsed={step.parsed} />
      case 'general':
      default:
        return <DefaultToolUI block={step.toolBlock} parsed={step.parsed} />
    }
  }

  return (
    <div className="aui-group-timeline">
      {steps.map((step, idx) => {
        const isExpanded = Boolean(expandedSteps[step.id])
        const isLast = idx === steps.length - 1
        const hasContent = Boolean(
          step.toolBlock.input || step.toolBlock.output || step.precedingReasoning
        )

        return (
          <div
            key={step.id}
            className={`aui-timeline-item status-${step.toolBlock.status} ${isExpanded ? 'is-expanded' : ''} ${isLast ? 'is-last' : ''}`}
          >
            {/* 时间线轴线与左侧状态圆点 */}
            <div className="aui-timeline-axis">
              <div className="aui-timeline-node">{getStepIcon(step)}</div>
              {!isLast ? <div className="aui-timeline-line" /> : null}
            </div>

            {/* 步骤主体内容 */}
            <div className="aui-timeline-content">
              {/* 步骤条 Header */}
              <div
                className={`aui-timeline-header ${hasContent ? 'is-clickable' : ''}`}
                onClick={hasContent ? () => toggleStep(step.id) : undefined}
                role="button"
                tabIndex={hasContent ? 0 : undefined}
                onKeyDown={(e) => {
                  if (hasContent && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    toggleStep(step.id)
                  }
                }}
              >
                <div className="aui-timeline-header-left">
                  <span className="aui-step-cat-wrapper">
                    {getCategoryMiniIcon(step.parsed.category)}
                  </span>
                  <span className="aui-step-display-name">{step.parsed.displayName}</span>
                  <span className="aui-step-code-name">{step.toolBlock.name}</span>

                  {step.parsed.primaryParam ? (
                    <span className="aui-step-param-pill" title={step.parsed.primaryParam}>
                      {step.parsed.primaryParam}
                    </span>
                  ) : null}
                </div>

                <div className="aui-timeline-header-right">
                  <ToolStatusBadge status={step.toolBlock.status} />
                  {hasContent ? (
                    <span className={`aui-step-chevron ${isExpanded ? 'is-expanded' : ''}`}>
                      <ChevronDown size={13} />
                    </span>
                  ) : null}
                </div>
              </div>

              {/* 展开的步骤详情 */}
              {isExpanded && hasContent ? (
                <div className="aui-timeline-step-body">
                  {/* 步骤前思考过程（如果有） */}
                  {step.precedingReasoning ? (
                    <div className="aui-step-reasoning-callout">
                      <div className="aui-step-reasoning-title">
                        <Sparkles size={11} />
                        <span>步骤思路</span>
                      </div>
                      <div className="aui-step-reasoning-text">{step.precedingReasoning}</div>
                    </div>
                  ) : null}

                  {/* 工具具体 UI 视图 */}
                  <div className="aui-step-tool-render">{renderStepBody(step)}</div>
                </div>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
