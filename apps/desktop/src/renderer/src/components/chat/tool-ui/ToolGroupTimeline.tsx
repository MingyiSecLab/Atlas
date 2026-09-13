import {
  AlertCircle,
  ChevronRight,
  FileCode,
  ListChecks,
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
import { TaskToolUI } from './TaskToolUI'
import { TerminalToolUI } from './TerminalToolUI'
import { formatElapsedMs, type ToolGroupStep } from './types'

interface ToolGroupTimelineProps {
  steps: ToolGroupStep[]
  isGroupRunning: boolean
}

export function ToolGroupTimeline({ steps }: ToolGroupTimelineProps): React.ReactNode {
  // 默认展开正在运行或报错的步骤
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
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

  const getStepMiniIcon = (step: ToolGroupStep): React.ReactNode => {
    const status = step.toolBlock.status
    if (status === 'running') {
      return <Loader2 size={13} className="aui-trace-item-icon is-running aui-tool-spinner" />
    }
    if (status === 'error' || status === 'denied') {
      return <AlertCircle size={13} className="aui-trace-item-icon is-error" />
    }
    switch (step.parsed.category) {
      case 'terminal':
        return <Terminal size={13} className="aui-trace-item-icon is-terminal" />
      case 'file_op':
        return <FileCode size={13} className="aui-trace-item-icon is-file" />
      case 'search':
        return <Search size={13} className="aui-trace-item-icon is-search" />
      case 'security':
        return <ShieldCheck size={13} className="aui-trace-item-icon is-security" />
      case 'task':
        return <ListChecks size={13} className="aui-trace-item-icon is-task" />
      default:
        return <Wrench size={13} className="aui-trace-item-icon is-general" />
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
      case 'task':
        return <TaskToolUI block={step.toolBlock} parsed={step.parsed} />
      case 'general':
      default:
        return <DefaultToolUI block={step.toolBlock} parsed={step.parsed} />
    }
  }

  return (
    <div className="aui-trace-list">
      {steps.map((step) => {
        const isExpanded = Boolean(expandedSteps[step.id])
        const hasContent = Boolean(
          step.toolBlock.input || step.toolBlock.output || step.precedingReasoning
        )
        const isError = step.toolBlock.status === 'error' || step.toolBlock.status === 'denied'
        const isRunning = step.toolBlock.status === 'running'

        // 获取单行摘要信息（优先主参数/命令，次之报错原因或输出摘要）
        const summaryText = isError && step.toolBlock.output
          ? step.toolBlock.output.slice(0, 80).replace(/\n/g, ' ')
          : step.parsed.primaryParam || step.toolBlock.summary || ''

        return (
          <div
            key={step.id}
            className={`aui-trace-item status-${step.toolBlock.status} ${isExpanded ? 'is-expanded' : ''}`}
          >
            {/* 单行紧凑 Header（参考 assistant-ui ToolTraceCard / ToolErrorCard） */}
            <div
              className={`aui-trace-header ${hasContent ? 'is-clickable' : ''}`}
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
              <div className="aui-trace-header-main">
                <span className="aui-trace-icon-slot">{getStepMiniIcon(step)}</span>

                <span className={`aui-trace-name ${isError ? 'is-error' : ''}`}>
                  {step.toolBlock.name}
                </span>

                {summaryText ? (
                  <span
                    className={`aui-trace-summary ${isError ? 'is-error' : ''}`}
                    title={summaryText}
                  >
                    {summaryText}
                  </span>
                ) : null}
              </div>

              <div className="aui-trace-header-meta">
                {step.toolBlock.elapsedMs !== undefined && !isRunning ? (
                  <span className="aui-trace-duration">
                    {formatElapsedMs(step.toolBlock.elapsedMs)}
                  </span>
                ) : null}

                {hasContent ? (
                  <span className={`aui-trace-chevron ${isExpanded ? 'is-expanded' : ''}`}>
                    <ChevronRight size={13} />
                  </span>
                ) : null}
              </div>
            </div>

            {/* 展开内容 */}
            {isExpanded && hasContent ? (
              <div className="aui-trace-content">
                {/* 思考过程 */}
                {step.precedingReasoning ? (
                  <div className="aui-trace-reasoning">
                    <div className="aui-trace-reasoning-header">
                      <Sparkles size={11} />
                      <span>思考思路</span>
                    </div>
                    <div className="aui-trace-reasoning-body">{step.precedingReasoning}</div>
                  </div>
                ) : null}

                {/* 工具详情主体 */}
                <div className="aui-trace-body">{renderStepBody(step)}</div>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

