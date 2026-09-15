import { Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  ToolGroupRoot,
  ToolGroupTrigger,
  ToolGroupContent
} from '@renderer/components/assistant-ui/elements/tool-group'
import { ToolCallCard } from './ToolCallCard'
import { formatLiveElapsedMs, useRunningClock } from '../useRunningClock'
import type { ToolGroupSummary } from './types'

interface ToolGroupProps {
  summary: ToolGroupSummary
  defaultOpen?: boolean
}

export function ToolGroup({ summary, defaultOpen }: ToolGroupProps): React.ReactNode {
  const isRunning = summary.status === 'running'
  const clock = useRunningClock(isRunning)

  // 如果正在运行且未明确指定，默认展开；完成后默认折叠
  const [isOpen, setIsOpen] = useState(() => {
    if (defaultOpen !== undefined) return defaultOpen
    return isRunning
  })

  // 统计安全渗透与攻击工具调用占比
  const { isAllSecurity, hasSecurity, securityCount } = useMemo(() => {
    const secSteps = summary.steps.filter((s) => s.parsed.category === 'security')
    return {
      isAllSecurity: secSteps.length === summary.steps.length && secSteps.length > 0,
      hasSecurity: secSteps.length > 0,
      securityCount: secSteps.length
    }
  }, [summary.steps])

  // 计算组内所有 task 步骤的索引，用于同组多清单折叠合并
  const taskStepIndices = useMemo(() => {
    return summary.steps
      .map((s, idx) => (s.parsed.category === 'task' ? idx : -1))
      .filter((idx) => idx !== -1)
  }, [summary.steps])
  const totalTaskSteps = taskStepIndices.length

  // 实时总耗时 = 已结算步骤耗时之和 + 当前步骤已运行时长
  // （单个步骤自身的计时由各自的 ToolCallCard 自行维护）
  const runningStepStartedAt = summary.runningStepStartedAt
  const liveElapsedLabel =
    clock !== null
      ? formatLiveElapsedMs(
          summary.totalElapsedMs +
            (runningStepStartedAt !== undefined ? Math.max(0, clock - runningStepStartedAt) : 0)
        )
      : undefined

  // 生成幽灵模式 (ghost) 下更具语义的触发标签
  const triggerLabel = useMemo(() => {
    const count = summary.totalCount
    if (isAllSecurity) {
      return isRunning
        ? `正在执行 ${count} 项渗透与攻击调用...`
        : `已执行 ${count} 项渗透与攻击调用`
    }
    if (hasSecurity) {
      return isRunning
        ? `正在执行 ${count} 项操作 (${securityCount} 项安全探测)...`
        : `已执行 ${count} 项工具调用 (含安全探测)`
    }
    if (summary.headline) {
      return isRunning ? `正在执行: ${summary.headline}...` : summary.headline
    }
    return isRunning ? `正在执行 ${count} 项工具调用...` : `${count} 项工具调用`
  }, [isAllSecurity, hasSecurity, isRunning, securityCount, summary.headline, summary.totalCount])

  // 有实时计时时去掉省略号，避免「正在执行… 12s」两种进行时信号叠加
  const displayLabel =
    liveElapsedLabel !== undefined ? triggerLabel.replace(/\.{3}$/, '') : triggerLabel

  return (
    <div className="chat-tool-group-wrapper w-full">
      <ToolGroupRoot
        variant="ghost"
        open={isOpen}
        onOpenChange={setIsOpen}
        className="transition-colors"
      >
        <ToolGroupTrigger
          count={summary.totalCount}
          active={isRunning}
          label={displayLabel}
          elapsed={liveElapsedLabel}
        />
        <ToolGroupContent>
          {summary.steps.map((step, stepIndex) => {
            const orderInTasks = taskStepIndices.indexOf(stepIndex)
            const isSuperseded = orderInTasks !== -1 && orderInTasks < totalTaskSteps - 1

            return (
              <div key={step.id} className="flex flex-col gap-1.5">
                {step.precedingReasoning ? (
                  <div className="aui-trace-reasoning rounded-lg bg-foreground/[0.02] p-2 text-xs">
                    <div className="aui-trace-reasoning-header mb-1 flex items-center gap-1.5 text-foreground/45">
                      <Sparkles size={12} className="text-amber-500" />
                      <span className="font-medium">思考思路</span>
                    </div>
                    <div className="aui-trace-reasoning-body leading-relaxed text-foreground/70">
                      {step.precedingReasoning}
                    </div>
                  </div>
                ) : null}
                <ToolCallCard
                  block={step.toolBlock}
                  isSuperseded={isSuperseded}
                  versionIndex={orderInTasks !== -1 ? orderInTasks + 1 : undefined}
                  totalVersions={orderInTasks !== -1 ? totalTaskSteps : undefined}
                />
              </div>
            )
          })}
        </ToolGroupContent>
      </ToolGroupRoot>
    </div>
  )
}
