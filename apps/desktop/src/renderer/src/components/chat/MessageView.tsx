import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  GitBranch,
  Pencil,
  ThumbsDown,
  ThumbsUp
} from 'lucide-react'
import { MessagePrimitive } from '@assistant-ui/react'
import type { ThreadMessage } from '@assistant-ui/react'
import { useMemo } from 'react'
import { Markdown } from './Markdown'
import { ReasoningBlock } from './ReasoningBlock'
import { ToolCallBlock } from './ToolCallBlock'
import { ToolGroup } from './tool-ui/ToolGroup'
import { groupChatBlocks } from './tool-ui/types'
import { SkillMessage } from './skills/SkillMessage'
import type { ChatBlock, ChatError, SkillBlock } from './types'
import { messageAnchorId, partsToChatBlocks, readAssistantMetadata } from './runtime/converter'
import { useCopyFeedback } from './useCopyFeedback'
import { ModelBrandIcon } from '../common/ModelBrandIcon'

function IconButton({
  label,
  children,
  onClick,
  disabled = false
}: {
  label: string
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
}): React.ReactNode {
  return (
    <button
      className="chat-icon-button"
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

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
  const blocks = useMemo(() => partsToChatBlocks(message.content), [message])
  const skill = findSkillBlock(blocks)
  const content = joinTextBlocks(blocks)
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
      <article className="chat-message chat-user-message" id={`message-${anchorId}`}>
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
        <div className="chat-user-meta">
          <time>{timestamp}</time>
          <IconButton label={copied ? '已复制' : '复制'} onClick={() => copy(content)}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </IconButton>
          <IconButton label="编辑 Prompt" disabled>
            <Pencil size={13} />
          </IconButton>
        </div>
      </article>
    </MessagePrimitive.Root>
  )
}

export function AssistantMessage({ message }: { message: ThreadMessage }): React.ReactNode {
  const { copied, copy } = useCopyFeedback()
  const running = message.status?.type === 'running'
  const metadata = readAssistantMetadata(message)
  const blocks = useMemo(() => partsToChatBlocks(message.content, running), [message, running])
  const anchorId = messageAnchorId(message)
  const timestamp = formatTimestamp(message.createdAt)
  const units = useMemo(() => groupChatBlocks(blocks, anchorId), [blocks, anchorId])
  const content = joinTextBlocks(blocks)
  const hasVisibleContent = blocks.some((block) => {
    if (!block) return false
    if (block.type === 'reasoning') return Boolean(block.text?.trim())
    if (block.type === 'tool' || block.type === 'skill') return true
    return Boolean(block.text?.trim())
  })

  // 空且已结束的 assistant 消息（如发送前中止）不渲染气泡
  if (!running && !hasVisibleContent) return null

  return (
    <MessagePrimitive.Root asChild>
      <article className="chat-message chat-assistant-message" id={`message-${anchorId}`}>
        <div className="chat-assistant-blocks" aria-live={running ? 'polite' : undefined}>
          {running && !hasVisibleContent ? (
            <div className="chat-typing-indicator" aria-label="正在思考">
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
            </div>
          ) : null}
          {units.map((unit) => {
            if (unit.type === 'tool_group') {
              return <ToolGroup key={unit.key} summary={unit.summary} />
            }

            const block = unit.block
            if (!block) return null
            if (block.type === 'reasoning') return <ReasoningBlock key={unit.key} block={block} />
            if (block.type === 'tool') return <ToolCallBlock key={unit.key} block={block} />
            if (block.type === 'skill') return <SkillMessage key={unit.key} skill={block} />
            return (
              <Markdown key={unit.key} isStreaming={running}>
                {block.text ?? ''}
              </Markdown>
            )
          })}
        </div>
        {!running || metadata.messageEnded ? (
          <div className="chat-turn-footer">
            <div className="chat-turn-actions">
              <IconButton label={copied ? '已复制' : '复制'} onClick={() => copy(content)}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </IconButton>
              <IconButton label="有帮助" disabled>
                <ThumbsUp size={13} />
              </IconButton>
              <IconButton label="没有帮助" disabled>
                <ThumbsDown size={13} />
              </IconButton>
              <IconButton label="创建分支" disabled>
                <GitBranch size={13} />
              </IconButton>
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
          </div>
        ) : null}
      </article>
    </MessagePrimitive.Root>
  )
}

export function ErrorMessage({ error }: { error: ChatError }): React.ReactNode {
  return (
    <div className="chat-error-message" role="alert" id={`message-${error.id}`}>
      <AlertTriangle size={15} />
      <span>{error.content}</span>
    </div>
  )
}
