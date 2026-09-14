import {
  FileCode,
  FilePlus,
  ListChecks,
  PenLine,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
  type LucideIcon
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import {
  ToolTimeline,
  type TimelineStep,
  type TimelineStat
} from '@renderer/components/assistant-ui/elements/tool-timeline'
import { DefaultToolUI } from './DefaultToolUI'
import { FileOpToolUI } from './FileOpToolUI'
import { PentestToolUI } from './PentestToolUI'
import { SearchToolUI } from './SearchToolUI'
import { TaskToolUI } from './TaskToolUI'
import { TerminalToolUI } from './TerminalToolUI'
import type { ToolGroupStep, ToolGroupSummary } from './types'

function getTimelineIcon(category?: string, verb?: string): LucideIcon {
  const v = verb?.toLowerCase() || ''
  if (v === 'thinking') return Sparkles
  if (category === 'terminal' || v === 'ran') return Terminal
  if (v === 'edited' || v === 'replace') return PenLine
  if (v === 'created' || v === 'write') return FilePlus
  if (v === 'read' || v === 'view') return FileCode
  if (category === 'search' || v === 'searched' || v === 'grep') return Search
  if (category === 'security' || v === 'scan' || v === 'auth' || v === 'crawl') return ShieldCheck
  if (category === 'task') return ListChecks
  return Wrench
}

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

  // 计算组内所有 task 步骤的索引，用于同组多清单折叠合并
  const taskStepIndices = useMemo(() => {
    return summary.steps
      .map((s, idx) => (s.parsed.category === 'task' ? idx : -1))
      .filter((idx) => idx !== -1)
  }, [summary.steps])
  const totalTaskSteps = taskStepIndices.length

  const renderStepBody = useCallback(
    (step: ToolGroupStep, stepIndex: number): React.ReactNode => {
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
    },
    [taskStepIndices, totalTaskSteps]
  )

  const steps: TimelineStep[] = useMemo(() => {
    return summary.steps.map((step, stepIndex) => {
      const hasContent = Boolean(
        step.toolBlock.input || step.toolBlock.output || step.precedingReasoning
      )
      return {
        verb: step.parsed.verb || 'Call',
        chip: step.parsed.chip || step.parsed.displayName || step.toolBlock.name,
        icon: getTimelineIcon(step.parsed.category, step.parsed.verb),
        detail: hasContent
          ? () => (
              <div className="space-y-2">
                {step.precedingReasoning ? (
                  <div className="aui-trace-reasoning">
                    <div className="aui-trace-reasoning-header">
                      <Sparkles size={11} />
                      <span>思考思路</span>
                    </div>
                    <div className="aui-trace-reasoning-body">{step.precedingReasoning}</div>
                  </div>
                ) : null}
                {renderStepBody(step, stepIndex)}
              </div>
            )
          : undefined
      }
    })
  }, [summary.steps, renderStepBody])

  const stats: TimelineStat[] = useMemo(() => {
    if (!summary.stats) return []
    return summary.stats.map((s) => ({
      file: s.fileName,
      added: s.additions,
      removed: s.deletions
    }))
  }, [summary.stats])

  const isRunning = summary.status === 'running'
  const restingLabel = summary.headline
    ? `${summary.headline} · ${summary.totalCount} 步`
    : `${summary.totalCount} 步操作`
  const activeLabel = `正在执行 ${summary.totalCount} 项操作...`

  return (
    <div className="chat-tool-group-text-wrapper w-full">
      <ToolTimeline
        steps={steps}
        visibleSteps={steps.length}
        streaming={isRunning}
        open={isOpen}
        onOpenChange={setIsOpen}
        restingLabel={restingLabel}
        activeLabel={activeLabel}
        stats={stats}
      />
    </div>
  )
}
