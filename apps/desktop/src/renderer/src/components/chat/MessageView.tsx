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
      <MessagePrimitive.Root asChild>
        <article className="chat-message chat-skill-activation" id={`message-${anchorId}`}>
          <SkillMessage skill={skill} />
        </article>
      </MessagePrimitive.Root>
    )
  }

  return (
    <MessagePrimitive.Root asChild>
      <article
        className="chat-message chat-user-message"
        id={`message-${anchorId}`}
        data-message-id={message.id}
      >
        {isEditing ? (
          <div className="chat-user-edit-container">
            <textarea
              className="chat-user-edit-textarea"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              autoFocus
            />
            <div className="chat-user-edit-actions">
              <button
                type="button"
                className="chat-user-edit-btn is-cancel"
                onClick={() => {
                  setIsEditing(false)
                  setEditText(content)
                }}
              >
                取消
              </button>
              <button
                type="button"
                className="chat-user-edit-btn is-save"
                disabled={!editText.trim() || editText === content}
                onClick={() => {
                  if (editText.trim()) {
                    aui.thread.append({
                      role: 'user',
                      content: [{ type: 'text', text: editText.trim() }]
                    })
                  }
                  setIsEditing(false)
                }}
              >
                保存并重新发送
              </button>
            </div>
          </div>
        ) : (
          <div className="chat-user-bubble">
            {images.length > 0 ? (
              <div className="chat-user-attachments" aria-label="消息图片">
                {images.map((part, index) => (
                  <img
                    key={`${anchorId}-image-${index}`}
                    src={part.type === 'image' ? part.image : ''}
                    alt={part.type === 'image' ? (part.filename ?? '附件图片') : '附件图片'}
                  />
                ))}
              </div>
            ) : null}
            {content ? <Markdown>{content}</Markdown> : null}
          </div>
        )}
        <div className="chat-user-meta">
          <time>{timestamp}</time>
          <BranchPicker />
          <TooltipIconButton
            tooltip={copied ? '已复制' : '复制'}
            onClick={() => copy(content)}
            className="size-5 p-0.5"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </TooltipIconButton>
          <TooltipIconButton
            tooltip="编辑 Prompt"
            onClick={() => {
              setIsEditing((prev) => !prev)
              setEditText(content)
            }}
            className="size-5 p-0.5"
          >
            <Pencil size={13} />
          </TooltipIconButton>
        </div>
      </article>
    </MessagePrimitive.Root>
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
    <MessagePrimitive.Root asChild>
      <article
        className="chat-message chat-assistant-message"
        id={`message-${anchorId}`}
        data-message-id={message.id}
      >
        <div className="chat-assistant-blocks" aria-live={running ? 'polite' : undefined}>
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
          <div className="chat-turn-footer">
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
            <div className="chat-turn-provenance">
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
            <FeedbackDialog
              messageId={anchorId}
              isOpen={feedbackOpen}
              onClose={() => setFeedbackOpen(false)}
              onSubmit={(data) => {
                console.log('Feedback submitted:', data)
              }}
            />
          </div>
        ) : null}
      </article>
    </MessagePrimitive.Root>
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
    <div className="chat-error-message" role="alert" id={`message-${error.id}`}>
      <div className="chat-error-content">
        <AlertTriangle size={15} className="chat-error-icon" />
        <span className="chat-error-text">{error.content}</span>
      </div>
      <div className="chat-error-actions">
        {onRetry ? (
          <button
            type="button"
            className="chat-error-action-btn is-retry"
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
            className="chat-error-action-btn is-dismiss"
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
