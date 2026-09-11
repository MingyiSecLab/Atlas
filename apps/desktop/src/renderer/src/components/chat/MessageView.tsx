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
import { Markdown } from './Markdown'
import { ReasoningBlock } from './ReasoningBlock'
import { ToolCallBlock } from './ToolCallBlock'
import { SkillMessage } from './skills/SkillMessage'
import type { ChatError, ChatMessage } from './types'
import { messageSkill, messageText } from './types'
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

export function UserMessage({ message }: { message: ChatMessage }): React.ReactNode {
  const { copied, copy } = useCopyFeedback()
  const content = messageText(message)
  const skill = messageSkill(message)

  if (skill) {
    return (
      <article className="chat-message chat-skill-activation" id={`message-${message.id}`}>
        <SkillMessage skill={skill} />
      </article>
    )
  }

  return (
    <article className="chat-message chat-user-message" id={`message-${message.id}`}>
      <div className="chat-user-bubble">
        {message.attachments && message.attachments.length > 0 ? (
          <div className="chat-user-attachments" aria-label="消息图片">
            {message.attachments.map((attachment) => (
              <img key={attachment.id} src={attachment.url} alt={attachment.name} />
            ))}
          </div>
        ) : null}
        {content ? <Markdown>{content}</Markdown> : null}
      </div>
      <div className="chat-user-meta">
        <time>{message.timestamp}</time>
        <IconButton label={copied ? '已复制' : '复制'} onClick={() => copy(content)}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </IconButton>
        <IconButton label="编辑 Prompt" disabled>
          <Pencil size={13} />
        </IconButton>
      </div>
    </article>
  )
}

export function AssistantMessage({ message }: { message: ChatMessage }): React.ReactNode {
  const { copied, copy } = useCopyFeedback()
  const content = messageText(message)
  const hasBlocks = (message.blocks ?? []).length > 0
  const hasVisibleContent =
    hasBlocks &&
    message.blocks.some((block) => {
      if (!block) return false
      if (block.type === 'reasoning') return Boolean(block.text?.trim())
      if (block.type === 'tool' || block.type === 'skill') return true
      return Boolean(block.text?.trim())
    })

  return (
    <article className="chat-message chat-assistant-message" id={`message-${message.id}`}>
      <div className="chat-assistant-blocks" aria-live={message.isStreaming ? 'polite' : undefined}>
        {message.isStreaming && !hasVisibleContent ? (
          <div className="chat-typing-indicator" aria-label="正在思考">
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
          </div>
        ) : null}
        {(message.blocks ?? []).map((block, index) => {
          if (!block) return null
          const key = `${message.id}-${block.type || 'text'}-${index}`
          if (block.type === 'reasoning') return <ReasoningBlock key={key} block={block} />
          if (block.type === 'tool') return <ToolCallBlock key={key} block={block} />
          if (block.type === 'skill') return <SkillMessage key={key} skill={block} />
          return (
            <Markdown key={key} isStreaming={message.isStreaming}>
              {block.text ?? ''}
            </Markdown>
          )
        })}
      </div>
      {!message.isStreaming ? (
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
            <time>{message.timestamp}</time>
            {message.modelName ? (
              <>
                <ModelBrandIcon model={message.modelName} size={12} />
                <span title={message.modelName}>{message.modelName}</span>
              </>
            ) : (
              <Bot size={13} />
            )}
          </div>
        </div>
      ) : null}
    </article>
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
