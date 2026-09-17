import { useState } from 'react'
import { Markdown } from '@renderer/components/assistant-ui/elements/markdown-text'
import type { ReasoningBlock as ReasoningBlockModel } from './types'
import {
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger
} from '@renderer/components/assistant-ui/elements/reasoning'

function formatSeconds(sec: number): string {
  // 对齐参考项目（linkcode thought-block）的紧凑时长文案：「已思考 1s」「已思考 2m 5s」
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

/**
 * 思维链 (CoT) 内容容器 / 折叠手风琴
 * 采用 assistant-ui 规范的 ReasoningRoot 系列原语：
 * 1. ghost 极简风格，无多余边框突兀占用视线；
 * 2. 流式期间支持展开查看，结束后收起为精简状态行；
 * 3. 带思考耗时标签与平滑手风琴高度动画。
 */
export function ReasoningBlock({ block }: { block: ReasoningBlockModel }): React.ReactNode {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const isStreaming = Boolean(block.isStreaming)

  // 运行中默认展开查看思考，完成后默认折叠；用户手动点击后以手动状态优先
  const isOpen = manualOpen !== null ? manualOpen : isStreaming
  const elapsed = block.elapsedSeconds

  return (
    <ReasoningRoot
      variant="ghost"
      streaming={isStreaming}
      open={isOpen}
      onOpenChange={(next) => setManualOpen(next)}
      className="my-1"
    >
      <ReasoningTrigger
        active={isStreaming}
        label={isStreaming ? '思考中' : '已思考'}
        duration={elapsed}
        durationLabel={(sec) => `已思考 ${formatSeconds(sec)}`}
      />
      <ReasoningContent aria-busy={isStreaming}>
        <ReasoningText>
          <Markdown isStreaming={isStreaming} className="leading-relaxed">
            {block.text || ''}
          </Markdown>
        </ReasoningText>
      </ReasoningContent>
    </ReasoningRoot>
  )
}
