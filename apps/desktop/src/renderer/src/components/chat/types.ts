export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export interface ToolOutputArtifactReference {
  sizeBytes: number
}

export type ToolStatus = 'pending' | 'waiting_approval' | 'running' | 'success' | 'error' | 'denied'

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ReasoningBlock {
  type: 'reasoning'
  text: string
  isStreaming?: boolean
  elapsedSeconds?: number
}

export interface ToolBlock {
  type: 'tool'
  id?: string
  name: string
  summary?: string
  input?: string
  output?: string
  outputArtifact?: ToolOutputArtifactReference
  outputTruncated?: boolean
  outputCaptureTruncated?: boolean
  status: ToolStatus
  /**
   * 执行耗时（毫秒）；仅实时流路径且在步骤结算后写入，历史消息无此数据。
   * 运行中步骤没有该值，改用 startedAt 现场推算。
   */
  elapsedMs?: number
  /**
   * 该工具在渲染层首次被观测到的时间戳（毫秒）；仅实时流路径写入。
   * 与 elapsedMs 配合：运行中步骤用 now - startedAt 得到实时耗时。
   */
  startedAt?: number
}

export interface SkillBlock {
  type: 'skill'
  name: string
  instructions?: string
  arguments?: string
}

export type ChatBlock = TextBlock | ReasoningBlock | ToolBlock | SkillBlock

export interface ChatImageAttachment {
  id: string
  name: string
  mimeType: ImageMimeType
  sizeBytes: number
  url: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  blocks: ChatBlock[]
  attachments?: ChatImageAttachment[]
  timestamp: string
  modelName?: string
  isStreaming?: boolean
}

export interface ChatError {
  id: string
  role: 'error'
  content: string
}

export type ChatTimelineItem = ChatMessage | ChatError

export function messageText(message: ChatMessage): string {
  if (!Array.isArray(message?.blocks)) return ''
  return message.blocks
    .filter((block): block is TextBlock => block?.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n')
}

export function messageSkill(message: ChatMessage): SkillBlock | undefined {
  if (!Array.isArray(message?.blocks)) return undefined
  return message.blocks.find((block): block is SkillBlock => block?.type === 'skill')
}
