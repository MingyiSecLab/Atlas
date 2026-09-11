import type { ChatImageAttachment, ChatMessage, ChatTimelineItem } from '../components/chat/types'
import { messageSkill, messageText } from '../components/chat/types'

const OPTIMISTIC_USER_MESSAGE_PREFIX = 'local-user-'

function sameAttachments(first: ChatMessage, second: ChatMessage): boolean {
  const firstAttachments = first.attachments ?? []
  const secondAttachments = second.attachments ?? []
  return (
    firstAttachments.length === secondAttachments.length &&
    firstAttachments.every((attachment, index) => {
      const candidate = secondAttachments[index]
      return attachment.name === candidate.name && attachment.mimeType === candidate.mimeType
    })
  )
}

function sameUserContent(first: ChatMessage, second: ChatMessage): boolean {
  const firstSkill = messageSkill(first)
  const secondSkill = messageSkill(second)
  return (
    first.role === 'user' &&
    second.role === 'user' &&
    (firstSkill || secondSkill
      ? firstSkill?.name === secondSkill?.name && firstSkill?.arguments === secondSkill?.arguments
      : messageText(first) === messageText(second)) &&
    sameAttachments(first, second)
  )
}

export function createOptimisticUserMessage(
  text: string,
  attachments: ChatImageAttachment[] = [],
  now = new Date(),
  id = crypto.randomUUID()
): ChatMessage {
  return {
    id: `${OPTIMISTIC_USER_MESSAGE_PREFIX}${id}`,
    role: 'user',
    blocks: text ? [{ type: 'text', text }] : [],
    ...(attachments.length ? { attachments: [...attachments] } : {}),
    timestamp: now.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }
}

export function createOptimisticSkillMessage(
  name: string,
  argumentsValue: string,
  attachments: ChatImageAttachment[] = [],
  now = new Date(),
  id = crypto.randomUUID()
): ChatMessage {
  return {
    id: `${OPTIMISTIC_USER_MESSAGE_PREFIX}${id}`,
    role: 'user',
    blocks: [
      {
        type: 'skill',
        name,
        ...(argumentsValue ? { arguments: argumentsValue } : {})
      }
    ],
    ...(attachments.length ? { attachments: [...attachments] } : {}),
    timestamp: now.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }
}

export function mergeTimelineMessage(
  timeline: ChatTimelineItem[],
  message: ChatMessage
): ChatTimelineItem[] {
  const existingIndex = timeline.findIndex((item) => item.id === message.id)
  if (existingIndex >= 0) {
    const next = [...timeline]
    next[existingIndex] = message
    return next
  }

  if (message.role === 'user') {
    for (let index = timeline.length - 1; index >= 0; index -= 1) {
      const candidate = timeline[index]
      if (
        candidate.role === 'user' &&
        candidate.id.startsWith(OPTIMISTIC_USER_MESSAGE_PREFIX) &&
        sameUserContent(candidate, message)
      ) {
        const next = [...timeline]
        next[index] = message
        return next
      }
    }
  }

  return [...timeline, message]
}
