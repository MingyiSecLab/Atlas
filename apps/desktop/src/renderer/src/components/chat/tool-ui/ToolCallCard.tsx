import { useMemo, useState } from 'react'
import type { ToolBlock } from '../types'
import { ToolCall } from '@renderer/components/assistant-ui/elements/tool-call'
import { DefaultToolUI } from './DefaultToolUI'
import { FileOpToolUI } from './FileOpToolUI'
import { PentestToolUI } from './PentestToolUI'
import { SearchToolUI } from './SearchToolUI'
import { TaskToolUI } from './TaskToolUI'
import { TerminalToolUI } from './TerminalToolUI'
import { analyzeToolCall, formatElapsedMs } from './types'
import { formatLiveElapsedMs, useRunningClock } from '../useRunningClock'

interface ToolCallCardProps {
  block: ToolBlock
  defaultOpen?: boolean
  isSuperseded?: boolean
  versionIndex?: number
  totalVersions?: number
}

export function ToolCallCard({
  block,
  defaultOpen = false,
  isSuperseded = false,
  versionIndex,
  totalVersions
}: ToolCallCardProps): React.ReactNode {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const parsed = useMemo(() => analyzeToolCall(block), [block])
  const hasContent = Boolean(block.input || block.output || block.outputArtifact)

  // 运行中步骤没有结算耗时，用 startedAt + 秒级时钟现场推算；结算后回落到 elapsedMs。
  // 卡片自己持有计时，分组外的单个工具调用也能获得同样的实时反馈。
  const clock = useRunningClock(block.status === 'running')
  const liveElapsedLabel =
    clock !== null && block.startedAt !== undefined
      ? formatLiveElapsedMs(Math.max(0, clock - block.startedAt))
      : undefined
  const settledElapsedLabel =
    block.elapsedMs !== undefined && block.elapsedMs > 0
      ? formatElapsedMs(block.elapsedMs)
      : undefined
  const elapsedLabel = liveElapsedLabel ?? settledElapsedLabel

  const renderToolBody = (): React.ReactNode => {
    switch (parsed.category) {
      case 'terminal':
        return <TerminalToolUI block={block} parsed={parsed} />
      case 'file_op':
        return <FileOpToolUI block={block} parsed={parsed} />
      case 'search':
        return <SearchToolUI block={block} parsed={parsed} />
      case 'security':
        return <PentestToolUI block={block} parsed={parsed} />
      case 'task':
        return (
          <TaskToolUI
            block={block}
            parsed={parsed}
            isSuperseded={isSuperseded}
            versionIndex={versionIndex}
            totalVersions={totalVersions}
          />
        )
      case 'general':
      default:
        return <DefaultToolUI block={block} parsed={parsed} />
    }
  }

  const title = parsed.displayName || block.name

  // 对于已被后续版本取代的任务清单，直接作为独立微型胶囊条呈现，避免双层折叠嵌套
  if (parsed.category === 'task' && isSuperseded) {
    return (
      <div className="chat-single-tool-text-wrapper">
        <TaskToolUI
          block={block}
          parsed={parsed}
          isSuperseded={isSuperseded}
          versionIndex={versionIndex}
          totalVersions={totalVersions}
        />
      </div>
    )
  }

  const runningLabel = parsed.verb ? `正在${parsed.verb}...` : '正在执行...'
  const isError = block.status === 'error' || block.status === 'denied'

  return (
    <div className="chat-single-tool-text-wrapper w-full">
      <ToolCall
        label={title}
        activeLabel={runningLabel}
        query={parsed.chip || parsed.primaryParam || ''}
        request={block.input || ''}
        result={block.output || ''}
        running={block.status === 'running'}
        isError={isError}
        elapsed={elapsedLabel}
        open={isOpen}
        onOpenChange={setIsOpen}
        detail={hasContent ? renderToolBody() : undefined}
      />
    </div>
  )
}
