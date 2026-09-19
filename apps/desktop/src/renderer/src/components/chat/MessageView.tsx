import { AlertTriangle, Bot, Check, Copy, Pencil, RotateCcw, X } from 'lucide-react'
import { MessagePrimitive, useAui } from '@assistant-ui/react'
import type { ThreadMessage } from '@assistant-ui/react'
import { useMemo, useState } from 'react'
import { Markdown, MarkdownText } from '@renderer/components/assistant-ui/elements/markdown-text'
import {
  MessageActions,
  type Reaction
} from '@renderer/components/assistant-ui/elements/message-actions'
import { TooltipIconButton } from '@renderer/components/assistant-ui/elements/tooltip-icon-button'
import { ReasoningBlock } from './ReasoningBlock'
import { ThinkingIndicator } from './ThinkingIndicator'
import { ToolCallBlock } from './ToolCallBlock'
import { ToolGroup } from './tool-ui/ToolGroup'
import { analyzeToolCall, groupChatBlocks } from './tool-ui/types'
import { SkillMessage } from './skills/SkillMessage'
import { BranchPicker } from './BranchPicker'
import { FeedbackDialog } from './FeedbackDialog'
import type { ChatBlock, ChatError, SkillBlock } from './types'
import { messageAnchorId, partsToChatBlocks, readAssistantMetadata } from './runtime/converter'
import { useCopyFeedback } from './useCopyFeedback'
import { ModelBrandIcon } from '../common/ModelBrandIcon'
import { cn } from '@renderer/lib/utils'

function formatTimestamp(value: string | Date): string {
  try {
    const date = typeof value === 'string' ? new Date(value) : value
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return '刚刚'
  }
}

function findSkillBlock(blocks: readonly ChatBlock[]): SkillBlock | undefined {
  return blocks.find((block): block is SkillBlock => block.type === 'skill')
}

function joinTextBlocks(blocks: readonly ChatBlock[]): string {
  return blocks
    .filter((block): block is Extract<ChatBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n')
}

export function UserMessage({ message }: { message: ThreadMessage }): React.ReactNode {
  const { copied, copy } = useCopyFeedback()
  const aui = useAui()
  const [isEditing, setIsEditing] = useState(false)
  const blocks = useMemo(() => partsToChatBlocks(message.content), [message])
  const skill = findSkillBlock(blocks)
  const content = joinTextBlocks(blocks)
  const [editText, setEditText] = useState(content)
  const images = message.content.filter((part) => part.type === 'image')
  const anchorId = messageAnchorId(message)
  const timestamp = formatTimestamp(message.createdAt)

  if (skill) {
    return (
      <article
        className="chat-message chat-skill-activation mb-4"
        id={`message-${anchorId}`}
        data-message-id={message.id}
      >
        <SkillMessage skill={skill} />
      </article>
    )
  }

  return (
    <article
      data-slot="aui-user-message-root"
      className="chat-message chat-user-message group/msg relative mb-4 flex w-full flex-col items-end gap-1"
      id={`message-${anchorId}`}
      data-message-id={message.id}
    >
      {isEditing ? (
        <div className="flex w-full max-w-[min(85%,680px)] flex-col gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
          <textarea
            className="min-h-[72px] w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (editText.trim()) {
                  setIsEditing(false)
                  aui.message?.reload?.()
                }
              }
              if (e.key === 'Escape') {
                setIsEditing(false)
                setEditText(content)
              }
            }}
            placeholder="编辑消息…"
            autoFocus
          />
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/50">
            <button
              type="button"
              className="inline-flex h-7 items-center rounded-lg px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
              onClick={() => {
                setIsEditing(false)
                setEditText(content)
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="inline-flex h-7 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
              disabled={!editText.trim() || editText === content}
              onClick={() => {
                if (editText.trim()) {
                  setIsEditing(false)
                  aui.message?.reload?.()
                }
              }}
            >
              保存并重新生成
            </button>
          </div>
        </div>
      ) : (
        <div className="relative max-w-[min(85%,680px)] rounded-2xl bg-muted px-4 py-2.5 text-foreground leading-relaxed shadow-2xs">
          {images.length > 0 ? (
            <div className="mb-2 grid max-w-[360px] grid-cols-3 gap-2" aria-label="消息图片">
              {images.map((part, index) => (
                <img
                  key={`${anchorId}-image-${index}`}
                  src={part.type === 'image' ? part.image : ''}
                  alt={part.type === 'image' ? (part.filename ?? '附件图片') : '附件图片'}
                  className="aspect-square w-full rounded-lg border border-border/40 object-cover shadow-2xs transition-transform hover:scale-[1.02]"
                />
              ))}
            </div>
          ) : null}
          {content ? <Markdown>{content}</Markdown> : null}
        </div>
      )}
      <div
        className={cn(
          'flex items-center justify-end gap-1.5 pt-0.5 text-muted-foreground',
          'pointer-events-none opacity-0 transition-opacity duration-150 motion-reduce:transition-none',
          'group-hover/msg:pointer-events-auto group-hover/msg:opacity-100',
          'focus-within:pointer-events-auto focus-within:opacity-100'
        )}
      >
        <time className="select-none text-[11px] text-muted-foreground/60">{timestamp}</time>
        <BranchPicker />
        <TooltipIconButton
          tooltip={copied ? '已复制' : '复制'}
          onClick={() => copy(content)}
          className="size-5.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
        >
          {copied ? (
            <Check
              size={13}
              className="text-emerald-500 animate-in fade-in zoom-in-50 duration-150"
            />
          ) : (
            <Copy size={13} />
          )}
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="编辑 Prompt"
          onClick={() => {
            setIsEditing((prev) => !prev)
            setEditText(content)
          }}
          className="size-5.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
        >
          <Pencil size={13} />
        </TooltipIconButton>
      </div>
    </article>
  )
}

export function AssistantMessage({ message }: { message: ThreadMessage }): React.ReactNode {
  const { copied, copy } = useCopyFeedback()
  const [thumbState, setThumbState] = useState<Reaction>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const aui = useAui()
  const running = message.status?.type === 'running'
  const metadata = readAssistantMetadata(message)
  const blocks = useMemo(() => partsToChatBlocks(message.content, running), [message, running])
  const anchorId = messageAnchorId(message)
  const timestamp = formatTimestamp(message.createdAt)
  const units = useMemo(() => groupChatBlocks(blocks, anchorId), [blocks, anchorId])
  const content = joinTextBlocks(blocks)
  const hasSpecialBlocks = blocks.some((block) => block.type !== 'text')
  const hasVisibleContent = blocks.some((block) => {
    if (block.type === 'reasoning') return Boolean(block.text?.trim())
    if (block.type === 'tool' || block.type === 'skill') return true
    return Boolean(block.text?.trim())
  })

  // 统计本条消息中所有独立渲染的 task 块，用于 Living Task List 历史折叠合并
  const singleTaskKeys = useMemo(() => {
    return units
      .filter((u) => {
        if (u.type !== 'single' || !u.block || u.block.type !== 'tool') return false
        return analyzeToolCall(u.block).category === 'task'
      })
      .map((u) => u.key)
  }, [units])
  const totalSingleTasks = singleTaskKeys.length

  // 空且已结束的 assistant 消息（如发送前中止）不渲染气泡
  if (!running && !hasVisibleContent) return null

  return (
    <article
      data-slot="aui-assistant-message-root"
      className="chat-message chat-assistant-message group relative mb-6 flex w-full flex-col gap-2.5 leading-relaxed text-foreground transition-all duration-150"
      id={`message-${anchorId}`}
      data-message-id={message.id}
    >
      <div
        data-slot="aui-assistant-message-blocks"
        className="flex min-w-0 w-full flex-col gap-3"
        aria-live={running ? 'polite' : undefined}
      >
        {!hasSpecialBlocks ? (
          <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
        ) : (
          units.map((unit) => {
            if (unit.type === 'tool_group') {
              return <ToolGroup key={unit.key} summary={unit.summary} />
            }

            const block = unit.block
            if (!block) return null
            if (block.type === 'reasoning') return <ReasoningBlock key={unit.key} block={block} />
            if (block.type === 'tool') {
              const taskOrder = singleTaskKeys.indexOf(unit.key)
              const isTask = taskOrder !== -1
              const isSuperseded = isTask && taskOrder < totalSingleTasks - 1
              return (
                <ToolCallBlock
                  key={unit.key}
                  block={block}
                  isSuperseded={isSuperseded}
                  versionIndex={isTask ? taskOrder + 1 : undefined}
                  totalVersions={isTask ? totalSingleTasks : undefined}
                />
              )
            }
            if (block.type === 'skill') return <SkillMessage key={unit.key} skill={block} />
            return (
              <Markdown key={unit.key} isStreaming={running}>
                {block.text ?? ''}
              </Markdown>
            )
          })
        )}
        <ThinkingIndicator running={running} blocks={blocks} />
      </div>
      {!running || metadata.messageEnded ? (
        <>
          <div
            data-slot="aui-assistant-message-footer"
            className="mt-1 flex w-full flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground select-none"
          >
            <div className="flex items-center gap-1">
              <BranchPicker />
              <MessageActions
                copied={copied}
                reaction={thumbState}
                regenerating={running}
                onCopy={() => copy(content)}
                onReactionChange={(next) => {
                  setThumbState(next)
                  if (next === 'down') {
                    setFeedbackOpen(true)
                  }
                }}
                onRegenerate={() => {
                  try {
                    aui.message?.reload?.()
                  } catch (err) {
                    console.warn('Failed to regenerate message:', err)
                  }
                }}
                onMore={() => setFeedbackOpen(true)}
              />
            </div>
            <div
              data-slot="aui-assistant-message-provenance"
              className="chat-turn-provenance ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground/70"
            >
              <time>{timestamp}</time>
              {metadata.modelName ? (
                <>
                  <ModelBrandIcon model={metadata.modelName} size={12} />
                  <span title={metadata.modelName}>{metadata.modelName}</span>
                </>
              ) : (
                <Bot size={13} />
              )}
            </div>
          </div>
          <FeedbackDialog
            messageId={anchorId}
            isOpen={feedbackOpen}
            onClose={() => setFeedbackOpen(false)}
            onSubmit={(data) => {
              console.log('Feedback submitted:', data)
            }}
          />
        </>
      ) : null}
    </article>
  )
}

export function ErrorMessage({
  error,
  onDismiss,
  onRetry
}: {
  error: ChatError
  onDismiss?: () => void
  onRetry?: () => void
}): React.ReactNode {
  return (
    <div
      role="alert"
      id={`message-${error.id}`}
      className="my-3 flex w-full items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive animate-in fade-in slide-in-from-bottom-1 duration-150"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <span className="text-xs leading-relaxed break-all font-medium">{error.content}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {onRetry ? (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-destructive/30 bg-card px-2.5 text-xs font-medium text-destructive shadow-2xs hover:bg-destructive/10 transition-colors cursor-pointer"
            onClick={onRetry}
            title="重新尝试"
            aria-label="重试生成"
          >
            <RotateCcw size={12} />
            <span>重试</span>
          </button>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-lg text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
            onClick={onDismiss}
            title="关闭提示"
            aria-label="关闭错误提示"
          >
            <X size={13} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
