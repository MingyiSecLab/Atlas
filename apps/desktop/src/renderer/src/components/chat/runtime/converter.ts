import type { RuntimeSessionMessage, RuntimeSessionMessageBlock } from '@mingyi/runtime'
import type {
  ThreadAssistantMessagePart,
  ThreadMessage,
  ThreadMessageLike,
  ThreadUserMessagePart,
  ToolCallMessagePart
} from '@assistant-ui/react'
import type { ChatBlock, SkillBlock, ToolStatus } from '../types'
import { parseSkillActivation } from '../skills/skill-activation'
import { safeParseJson } from '../tool-ui/types'

/**
 * Runtime wire 消息与 assistant-ui 消息模型之间的单一映射源。
 * 历史加载（runtimeMessageToThreadMessageLike）与实时流（runtimeBlocksToParts）
 * 共用同一套转换，保证两条路径渲染一致。
 */

/** 审批事件带来的工具状态覆盖（key 为 toolCallId） */
export type ToolStatusOverlay = ReadonlyMap<string, 'waiting_approval' | 'denied'>

/** assistant 消息自定义 metadata（存于 ThreadMessage.metadata.custom） */
export interface AssistantRunMetadata {
  /** 本 run 最新一条 runtime assistant 消息 id（DOM 锚点与 minimap 使用） */
  runtimeMessageId?: string
  modelName?: string
  /** 最新 runtime 消息是否已收到 phase=end */
  messageEnded?: boolean
}

/** 用户发送消息自定义 metadata（append 时写入，extractSendPayload 读出） */
export interface UserSendMetadata {
  goalMode?: boolean
  expertPrompt?: string
  expertName?: string
  skillInvocation?: { name: string; arguments: string }
}

export interface SendFile {
  data: string
  mediaType: string
  filename?: string
}

export type SendPayload =
  | {
      kind: 'message'
      text: string
      files: SendFile[]
      goalMode?: boolean
      expertPrompt?: string
      expertName?: string
    }
  | { kind: 'skill'; name: string; arguments: string; files: SendFile[] }

const DATA_URL_PATTERN = /^data:([^;,]+);base64,([\s\S]*)$/

/** data URL → 原始 base64 载荷 */
export function dataUrlPayload(url: string): string {
  return DATA_URL_PATTERN.exec(url)?.[2] ?? ''
}

/** data URL → MIME 类型（无法解析时回退 image/png） */
export function dataUrlMediaType(url: string): string {
  return DATA_URL_PATTERN.exec(url)?.[1] ?? 'image/png'
}

function isImageMimeType(value: string): boolean {
  return (
    value === 'image/jpeg' ||
    value === 'image/png' ||
    value === 'image/gif' ||
    value === 'image/webp'
  )
}

function toolResult(output: string | undefined): unknown {
  if (output === undefined) return undefined
  const parsed = safeParseJson(output)
  return parsed !== null ? parsed : output
}

function serializeResult(result: unknown): string | undefined {
  if (result === undefined) return undefined
  return typeof result === 'string' ? result : JSON.stringify(result)
}

/** 已结算的工具耗时（毫秒），key 为 toolCallId；经 providerMetadata.mingyi 传递 */
export type ToolTimingMap = ReadonlyMap<string, number>

/** 工具首次被观测到的时间戳（毫秒），key 为 toolCallId；经 providerMetadata.mingyi 传递 */
export type ToolStartMap = ReadonlyMap<string, number>

/**
 * Runtime wire blocks → assistant-ui parts。
 * 过滤空文本/推理块（空尾随 part 会提前终结前序 part 的流式状态）。
 */
export function runtimeBlocksToParts(
  blocks: readonly RuntimeSessionMessageBlock[],
  role: 'user' | 'assistant',
  overlay?: ToolStatusOverlay,
  timing?: ToolTimingMap,
  startedAt?: ToolStartMap
): ThreadAssistantMessagePart[] {
  const parts: ThreadAssistantMessagePart[] = []
  for (const block of blocks) {
    if (block.type === 'text') {
      const text = typeof block.text === 'string' ? block.text : ''
      if (!text.trim()) continue
      if (role === 'user') {
        const skill = parseSkillActivation(text)
        if (skill) {
          parts.push({ type: 'data', name: 'skill', data: skill })
          continue
        }
      }
      parts.push({ type: 'text', text })
      continue
    }
    if (block.type === 'reasoning') {
      const text = typeof block.text === 'string' ? block.text : ''
      if (!text.trim()) continue
      parts.push({ type: 'reasoning', text })
      continue
    }
    if (role !== 'assistant') continue
    const status = overlay?.get(block.id) ?? block.status ?? 'success'
    const args = (safeParseJson(block.input) ?? {}) as ToolCallMessagePart['args']
    const denied = status === 'denied'
    const waiting = status === 'waiting_approval'
    const finished = status === 'success' || status === 'error'
    const result = finished ? toolResult(block.output) : undefined
    const elapsedMs = timing?.get(block.id)
    const blockStartedAt = startedAt?.get(block.id)
    const mingyiMetadata: Record<string, number> = {}
    if (elapsedMs !== undefined) mingyiMetadata.elapsedMs = elapsedMs
    if (blockStartedAt !== undefined) mingyiMetadata.startedAt = blockStartedAt
    parts.push({
      type: 'tool-call',
      toolCallId: block.id,
      toolName: block.name || 'tool',
      args,
      argsText: typeof block.input === 'string' ? block.input : '',
      ...(result !== undefined ? { result } : {}),
      ...(status === 'error' || denied ? { isError: true } : {}),
      ...(denied
        ? { approval: { id: block.id, approved: false }, result: { error: 'denied' } }
        : waiting
          ? { approval: { id: block.id } }
          : {}),
      ...(Object.keys(mingyiMetadata).length > 0
        ? {
            providerMetadata: {
              mingyi: mingyiMetadata
            } as ToolCallMessagePart['providerMetadata']
          }
        : {})
    })
  }
  return parts
}

/** 一条持久化 runtime 消息 → ThreadMessageLike（历史加载） */
export function runtimeMessageToThreadMessageLike(
  message: RuntimeSessionMessage,
  overlay?: ToolStatusOverlay
): ThreadMessageLike {
  const blocks = Array.isArray(message.blocks) ? message.blocks : []
  if (message.role === 'user') {
    const imageParts: ThreadUserMessagePart[] = (message.attachments ?? [])
      .filter((attachment) => isImageMimeType(attachment.mediaType))
      .map((attachment) => ({
        type: 'image' as const,
        image: attachment.dataUrl,
        filename: attachment.name
      }))
    const content = runtimeBlocksToParts(blocks, 'user') as ThreadUserMessagePart[]
    return {
      id: message.id,
      role: 'user',
      createdAt: new Date(message.createdAt),
      content: [...imageParts, ...content]
    }
  }
  return {
    id: message.id,
    role: 'assistant',
    createdAt: new Date(message.createdAt),
    content: runtimeBlocksToParts(blocks, 'assistant', overlay),
    metadata: {
      custom: {
        runtimeMessageId: message.id,
        ...(message.modelName ? { modelName: message.modelName } : {}),
        messageEnded: true
      }
    }
  }
}

function toolStatusFromPart(part: ToolCallMessagePart): ToolStatus {
  if (part.approval?.approved === false) return 'denied'
  if (part.approval !== undefined && part.approval.approved === undefined) {
    return 'waiting_approval'
  }
  if (part.isError) return 'error'
  if (part.result !== undefined) return 'success'
  return 'running'
}

/** 从 part.providerMetadata.mingyi 读出耗时 */
function readElapsedMs(part: ToolCallMessagePart): number | undefined {
  const mingyi = part.providerMetadata?.['mingyi'] as { elapsedMs?: unknown } | undefined
  return typeof mingyi?.elapsedMs === 'number' ? mingyi.elapsedMs : undefined
}

/** 从 part.providerMetadata.mingyi 读出起始时间戳 */
function readStartedAt(part: ToolCallMessagePart): number | undefined {
  const mingyi = part.providerMetadata?.['mingyi'] as { startedAt?: unknown } | undefined
  return typeof mingyi?.startedAt === 'number' ? mingyi.startedAt : undefined
}

/** assistant-ui parts → 现有渲染层的 ChatBlock[]（工具 UI 子系统原样复用） */
export function partsToChatBlocks(
  parts: ThreadMessage['content'],
  isStreaming = false
): ChatBlock[] {
  const blocks: ChatBlock[] = []
  for (const part of parts) {
    if (part.type === 'text') {
      if (!part.text) continue
      blocks.push({ type: 'text', text: part.text })
    } else if (part.type === 'reasoning') {
      if (!part.text) continue
      blocks.push({ type: 'reasoning', text: part.text, isStreaming })
    } else if (part.type === 'tool-call') {
      const output = serializeResult(part.result)
      const elapsedMs = readElapsedMs(part)
      const blockStartedAt = readStartedAt(part)
      blocks.push({
        type: 'tool',
        id: part.toolCallId,
        name: part.toolName,
        ...(part.argsText ? { input: part.argsText } : {}),
        ...(output !== undefined ? { output } : {}),
        status: toolStatusFromPart(part),
        ...(elapsedMs !== undefined ? { elapsedMs } : {}),
        ...(blockStartedAt !== undefined ? { startedAt: blockStartedAt } : {})
      })
    } else if (part.type === 'data' && part.name === 'skill') {
      const skill = part.data as SkillBlock | undefined
      if (skill && typeof skill === 'object' && typeof skill.name === 'string') {
        blocks.push({
          type: 'skill',
          name: skill.name,
          ...(skill.instructions ? { instructions: skill.instructions } : {}),
          ...(skill.arguments ? { arguments: skill.arguments } : {})
        })
      }
    }
  }
  return blocks
}

/** 从末条 user 消息提取 IPC 发送载荷（adapter 发送时使用） */
export function extractSendPayload(messages: readonly ThreadMessage[]): SendPayload | null {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'user') return null
  const custom = (last.metadata?.custom ?? {}) as Partial<UserSendMetadata>
  const files: SendFile[] = []
  let text = ''
  let skill: { name: string; arguments: string } | undefined
  for (const part of last.content) {
    if (part.type === 'image') {
      const data = dataUrlPayload(part.image)
      if (data) {
        files.push({
          data,
          mediaType: dataUrlMediaType(part.image),
          ...(part.filename ? { filename: part.filename } : {})
        })
      }
    } else if (part.type === 'text' && part.text) {
      text = text ? `${text}\n${part.text}` : part.text
    } else if (part.type === 'data' && part.name === 'skill') {
      const skillData = part.data as SkillBlock | undefined
      if (skillData && typeof skillData.name === 'string') {
        skill = { name: skillData.name, arguments: skillData.arguments ?? '' }
      }
    }
  }
  const invocation = custom.skillInvocation
  if (skill || invocation) {
    return {
      kind: 'skill',
      name: skill?.name ?? invocation?.name ?? '',
      arguments: skill?.arguments ?? invocation?.arguments ?? '',
      files
    }
  }
  return {
    kind: 'message',
    text,
    files,
    ...(custom.goalMode ? { goalMode: true } : {}),
    ...(custom.expertPrompt ? { expertPrompt: custom.expertPrompt } : {}),
    ...(custom.expertName ? { expertName: custom.expertName } : {})
  }
}

/** 读取消息上的 assistant 自定义 metadata */
export function readAssistantMetadata(message: ThreadMessage): AssistantRunMetadata {
  return (message.metadata?.custom ?? {}) as AssistantRunMetadata
}

/** DOM 锚点 id（#message-<id>，优先 runtime 消息 id） */
export function messageAnchorId(message: ThreadMessage): string {
  return readAssistantMetadata(message).runtimeMessageId ?? message.id
}
