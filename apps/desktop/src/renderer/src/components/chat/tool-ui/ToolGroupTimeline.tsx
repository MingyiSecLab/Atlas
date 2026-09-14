import {
  AlertCircle,
  ChevronRight,
  FileCode,
  FilePlus,
  ListChecks,
  Loader2,
  PenLine,
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
import { formatElapsedMs, type TimelineStat, type ToolGroupStep } from './types'

interface ToolGroupTimelineProps {
  steps: ToolGroupStep[]
  stats?: TimelineStat[]
  isGroupRunning?: boolean
}

export function ToolGroupTimeline({ steps, stats = [] }: ToolGroupTimelineProps): React.ReactNode {
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

  const getTimelineStepIcon = (step: ToolGroupStep): React.ReactNode => {
    const status = step.toolBlock.status
    if (status === 'running') {
      return <Loader2 size={13} className="aui-timeline-icon is-running aui-tool-spinner" />
    }
    if (status === 'error' || status === 'denied') {
      return <AlertCircle size={13} className="aui-timeline-icon is-error" />
    }

    const verb = step.parsed.verb?.toLowerCase() || ''
    const cat = step.parsed.category

    if (verb === 'thinking') {
      return <Sparkles size={13} className="aui-timeline-icon is-thinking" />
    }
    if (cat === 'terminal' || verb === 'ran') {
      return <Terminal size={13} className="aui-timeline-icon is-terminal" />
    }
    if (verb === 'edited' || verb === 'replace') {
      return <PenLine size={13} className="aui-timeline-icon is-edit" />
    }
    if (verb === 'created' || verb === 'write') {
      return <FilePlus size={13} className="aui-timeline-icon is-create" />
    }
    if (verb === 'read' || verb === 'view') {
      return <FileCode size={13} className="aui-timeline-icon is-file" />
    }
    if (cat === 'search' || verb === 'searched' || verb === 'grep') {
      return <Search size={13} className="aui-timeline-icon is-search" />
    }
    if (cat === 'security' || verb === 'scan' || verb === 'auth' || verb === 'crawl') {
      return <ShieldCheck size={13} className="aui-timeline-icon is-security" />
    }
    if (cat === 'task') {
      return <ListChecks size={13} className="aui-timeline-icon is-task" />
    }
    return <Wrench size={13} className="aui-timeline-icon is-general" />
  }

  // 计算组内所有 task 步骤的索引，用于同组多清单折叠合并
  const taskStepIndices = steps
    .map((s, idx) => (s.parsed.category === 'task' ? idx : -1))
    .filter((idx) => idx !== -1)
  const totalTaskSteps = taskStepIndices.length

  const renderStepBody = (step: ToolGroupStep, stepIndex: number): React.ReactNode => {
    switch (step.parsed.category) {
      case 'terminal':
        return <TerminalToolUI block={step.toolBlock} parsed={step.parsed} />
      case 'file_op':
        return <FileOpToolUI block={step.toolBlock} parsed={step.parsed} />
      case 'search':
        return <SearchToolUI block={step.toolBlock} parsed={step.parsed} />
      case 'security':
        return <PentestToolUI block={step.toolBlock} parsed={step.parsed} />
      case 'task': {
        const orderInTasks = taskStepIndices.indexOf(stepIndex)
        const isSuperseded = orderInTasks !== -1 && orderInTasks < totalTaskSteps - 1
        return (
          <TaskToolUI
            block={step.toolBlock}
            parsed={step.parsed}
            isSuperseded={isSuperseded}
            versionIndex={orderInTasks + 1}
            totalVersions={totalTaskSteps}
          />
        )
      }
      case 'general':
      default:
        return <DefaultToolUI block={step.toolBlock} parsed={step.parsed} />
    }
  }

  return (
    <div className="aui-tool-timeline-container">
      {/* 步骤序列：动词 (verb) + 目标对象 (chip) 极简列表 */}
      <div className="aui-timeline-trace-list">
        {steps.map((step, stepIndex) => {
          const isExpanded = Boolean(expandedSteps[step.id])
          const hasContent = Boolean(
            step.toolBlock.input || step.toolBlock.output || step.precedingReasoning
          )
          const isError = step.toolBlock.status === 'error' || step.toolBlock.status === 'denied'
          const isRunning = step.toolBlock.status === 'running'

          return (
            <div
              key={step.id}
              className={`aui-timeline-step status-${step.toolBlock.status} ${isExpanded ? 'is-expanded' : ''}`}
            >
              {/* 动作行：assistant-ui Elements 样式 */}
              <div
                className={`aui-timeline-step-row ${hasContent ? 'is-clickable' : ''}`}
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
                <div className="aui-timeline-step-left">
                  <span className="aui-timeline-icon-slot">{getTimelineStepIcon(step)}</span>
                  <span className={`aui-timeline-verb ${isError ? 'is-error' : ''}`}>
                    {step.parsed.verb || 'Call'}
                  </span>
                  <code
                    className={`aui-timeline-chip ${isError ? 'is-error' : ''}`}
                    title={step.parsed.chip || step.parsed.displayName}
                  >
                    {step.parsed.chip || step.parsed.displayName}
                  </code>
                </div>

                <div className="aui-timeline-step-right">
                  {step.toolBlock.elapsedMs !== undefined && !isRunning ? (
                    <span className="aui-timeline-step-duration">
                      {formatElapsedMs(step.toolBlock.elapsedMs)}
                    </span>
                  ) : null}

                  {hasContent ? (
                    <span className={`aui-timeline-chevron ${isExpanded ? 'is-expanded' : ''}`}>
                      <ChevronRight size={12} />
                    </span>
                  ) : null}
                </div>
              </div>

              {/* 展开内容：深入排查详情 */}
              {isExpanded && hasContent ? (
                <div className="aui-timeline-step-details">
                  {step.precedingReasoning ? (
                    <div className="aui-trace-reasoning">
                      <div className="aui-trace-reasoning-header">
                        <Sparkles size={11} />
                        <span>思考思路</span>
                      </div>
                      <div className="aui-trace-reasoning-body">{step.precedingReasoning}</div>
                    </div>
                  ) : null}

                  <div className="aui-trace-body">{renderStepBody(step, stepIndex)}</div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* 底部文件变动统计 (assistant-ui Tool Timeline Stats Row) */}
      {stats && stats.length > 0 ? (
        <div className="aui-timeline-stats-row" aria-label="文件变更统计">
          {stats.map((stat, idx) => (
            <div
              key={`${stat.fileName}-${idx}`}
              className="aui-timeline-stat-chip"
              title={stat.filePath || stat.fileName}
            >
              <span className="stat-filename">{stat.fileName}</span>
              {typeof stat.additions === 'number' && stat.additions > 0 ? (
                <span className="stat-add">+{stat.additions}</span>
              ) : null}
              {typeof stat.deletions === 'number' && stat.deletions > 0 ? (
                <span className="stat-del">-{stat.deletions}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
