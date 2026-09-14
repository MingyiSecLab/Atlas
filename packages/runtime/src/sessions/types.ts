import type { MastraCodeState } from '@mastra/code-sdk/schema'

export type RuntimeSessionMessageRole = 'user' | 'assistant'

export interface RuntimeSessionTextBlock {
  type: 'text'
  text: string
}

export interface RuntimeSessionReasoningBlock {
  type: 'reasoning'
  text: string
}

export type RuntimeSessionToolStatus =
  'pending' | 'waiting_approval' | 'running' | 'success' | 'error' | 'denied'

export interface RuntimeSessionToolBlock {
  type: 'tool'
  id: string
  name: string
  input?: string
  output?: string
  status: RuntimeSessionToolStatus
}

export type RuntimeSessionMessageBlock =
  RuntimeSessionTextBlock | RuntimeSessionReasoningBlock | RuntimeSessionToolBlock

export interface RuntimeSessionAttachment {
  id: string
  name: string
  mediaType: string
  sizeBytes?: number
  dataUrl: string
}

export interface RuntimeSessionMessage {
  id: string
  role: RuntimeSessionMessageRole
  blocks: RuntimeSessionMessageBlock[]
  attachments?: RuntimeSessionAttachment[]
  modelName?: string
  createdAt: string
}

export interface RuntimeAccessRequest {
  toolCallId: string
  path: string
  reason: string
}

export interface RuntimeTokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  reasoningTokens?: number
  cachedInputTokens?: number
}

export interface RuntimeSessionSummary {
  id: string
  title: string
  pinned: boolean
  createdAt: string
  updatedAt: string
  modelId: string | null
  modeId: string
  isRunning: boolean
  /** Registered project that owns this session; absent means a temporary session. */
  projectId?: string
  /** Workspace path captured when the session was created. */
  projectPath?: string
  tokenUsage?: RuntimeTokenUsage
}

export interface RuntimeSessionSnapshot extends RuntimeSessionSummary {
  messages: RuntimeSessionMessage[]
  accessRequests: RuntimeAccessRequest[]
}

export interface CreateRuntimeSessionInput {
  id?: string
  title?: string
  modelId?: string
  modeId?: string
  /** Registered project id; omit for a temporary session. */
  projectId?: string
}

export interface UpdateRuntimeSessionInput {
  sessionId: string
  title?: string
  pinned?: boolean
  modelId?: string
  modeId?: string
}

export interface SendRuntimeSessionMessageInput {
  sessionId: string
  content: string
  files?: Array<{
    data: string
    mediaType: string
    filename?: string
  }>
  goalMode?: boolean
  expertPrompt?: string
  expertName?: string
}

export interface RespondRuntimeAccessRequestInput {
  sessionId: string
  toolCallId: string
  approved: boolean
}

export type RuntimeSessionEvent =
  | {
      type: 'message'
      sessionId: string
      phase: 'start' | 'update' | 'end'
      message: RuntimeSessionMessage
    }
  | {
      type: 'run_state'
      sessionId: string
      isRunning: boolean
      reason?: 'complete' | 'aborted' | 'error' | 'suspended'
    }
  | {
      type: 'access_request'
      sessionId: string
      request: RuntimeAccessRequest
    }
  | {
      type: 'access_request_resolved'
      sessionId: string
      toolCallId: string
      approved: boolean
    }
  | {
      type: 'session_changed'
      session: RuntimeSessionSummary
    }
  | {
      type: 'error'
      sessionId: string
      message: string
      retryable?: boolean
      retryAttempt?: number
      maxRetries?: number
      retryDelay?: number
    }

export type RuntimeSessionEventListener = (event: RuntimeSessionEvent) => void | Promise<void>

export interface RuntimeSessionService {
  /** List sessions belonging to the active workspace plus temporary sessions. */
  list(): Promise<RuntimeSessionSummary[]>
  /** List all Desktop sessions across registered workspace paths. */
  listAll(): Promise<RuntimeSessionSummary[]>
  create(input?: CreateRuntimeSessionInput): Promise<RuntimeSessionSnapshot>
  get(sessionId: string): Promise<RuntimeSessionSnapshot>
  update(input: UpdateRuntimeSessionInput): Promise<RuntimeSessionSnapshot>
  delete(sessionId: string): Promise<void>
  sendMessage(input: SendRuntimeSessionMessageInput): Promise<void>
  respondToAccessRequest(input: RespondRuntimeAccessRequestInput): Promise<void>
  abort(sessionId: string): Promise<void>
  subscribe(listener: RuntimeSessionEventListener): () => void
  shutdown(): Promise<void>
  /**
   * 将 OM（Observational Memory）等 Controller state 更新广播到 default 会话与
   * 全部已物化会话，并记录为覆盖值 —— 后续创建的新会话会在挂载时重放。
   * 各 Session state 相互隔离（创建时从 initialState 克隆），逐会话写入是
   * 让运行中会话立即读到更新的唯一途径。
   */
  applyOmState(updates: Partial<MastraCodeState>): Promise<void>
}
