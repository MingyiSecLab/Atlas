import { ChevronRight, Brain } from 'lucide-react'
import { useState } from 'react'
import { Markdown } from './Markdown'
import type { ReasoningBlock as ReasoningBlockModel } from './types'

function formatSeconds(sec: number): string {
  if (sec < 60) return `${sec} 秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分`
}

/**
 * 思维链 (CoT) 内容容器 / 折叠面板
 * 专职呈现 Agent 的推理思考过程文本：
 * 1. 作为持久态内容保存，流式生成中默认展开方便观察，完成后默认折叠保持对话清爽；
 * 2. 支持流式 Markdown 渲染；
 * 3. 剥离瞬时跑秒状态，专注高品质阅读与交互。
 */
export function ReasoningBlock({ block }: { block: ReasoningBlockModel }): React.ReactNode {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const isStreaming = Boolean(block.isStreaming)

  // 运行中默认展开查看思考，完成后默认折叠；用户手动点击后以手动状态优先
  const isOpen = manualOpen !== null ? manualOpen : isStreaming

  const elapsed = block.elapsedSeconds
  const label =
    elapsed && elapsed > 0
      ? `已深度思考 ${formatSeconds(elapsed)}`
      : isStreaming
        ? '思考过程 (生成中)'
        : '思考过程'

  return (
    <div
      className={`aui-reasoning-container ${isStreaming ? 'is-streaming' : ''} ${isOpen ? 'is-open' : ''}`}
    >
      {/* 思维链折叠触发栏 */}
      <button
        type="button"
        className="aui-reasoning-trigger"
        onClick={() => setManualOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="aui-reasoning-left">
          <span className={`aui-reasoning-icon ${isStreaming ? 'is-active' : ''}`}>
            <Brain size={13} />
          </span>
          <span className="aui-reasoning-label">{label}</span>
        </div>
        <div className="aui-reasoning-right">
          <ChevronRight
            size={13}
            className={`aui-reasoning-chevron ${isOpen ? 'is-expanded' : ''}`}
          />
        </div>
      </button>

      {/* 展开的思维链内容流 */}
      {isOpen ? (
        <div className="aui-reasoning-body">
          <div className="aui-reasoning-content">
            <Markdown isStreaming={isStreaming}>{block.text || ''}</Markdown>
          </div>
        </div>
      ) : null}
    </div>
  )
}
