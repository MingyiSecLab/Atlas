import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Disclosure } from './Disclosure'
import { Markdown } from './Markdown'
import type { ReasoningBlock as ReasoningBlockModel } from './types'

export function ReasoningBlock({ block }: { block: ReasoningBlockModel }): React.ReactNode {
  const [manualOpen, setManualOpen] = useState(false)
  const open = Boolean(block.isStreaming) || manualOpen
  const summary = block.isStreaming
    ? '正在分析问题'
    : block.elapsedSeconds
      ? `思考了 ${block.elapsedSeconds} 秒`
      : undefined

  return (
    <Disclosure
      open={open}
      onToggle={() => setManualOpen((value) => !value)}
      icon={<Sparkles size={14} />}
      title={block.isStreaming ? '正在思考' : '思考过程'}
      summary={summary}
      running={block.isStreaming}
    >
      <div className="chat-reasoning-body">
        <Markdown isStreaming={block.isStreaming}>{block.text}</Markdown>
      </div>
    </Disclosure>
  )
}
