import { randomUUID } from 'node:crypto'
import type { MastraCodeState } from '@mastra/code-sdk/schema'
import type {
  AgentController,
  AgentControllerEvent,
  AgentControllerThread,
  Session
} from '@mastra/core/agent-controller'
import { defineRuntimeModel } from '../models/config.js'
import { toRuntimeSessionMessage } from './messages.js'
import type {
  CreateRuntimeSessionInput,
  RuntimeSessionEvent,
  RuntimeSessionEventListener,
  RuntimeSessionService,
  RuntimeSessionSnapshot,
  RuntimeSessionSummary,
  RuntimeAccessRequest,
  SendRuntimeSessionMessageInput,
  UpdateRuntimeSessionInput
} from './types.js'

const CLIENT_TAG = 'mingyiClient'
const CLIENT_ID = 'desktop'
const PROJECT_ID_KEY = 'projectId'
const PROJECT_PATH_KEY = 'projectPath'
const PINNED_KEY = 'mingyiPinned'
const SESSION_SCOPE_PREFIX = 'mingyi-desktop:'

interface MaterializedSession {
  session: Session<MastraCodeState>
  unsubscribe: () => void
}

interface RuntimeSessionServiceDependencies {
  controller: AgentController<MastraCodeState>
  defaultSession: Session<MastraCodeState>
  workspacePath: string
  wireSession?: (session: Session<MastraCodeState>) => Promise<void>
  activateSession?: (session: Session<MastraCodeState>) => void
}

function requiredId(value: string): string {
  const id = value.trim()
  if (!id || id.length > 200 || /[\u0000-\u001f]/.test(id)) {
    throw new Error('Session ID must be a non-empty printable string.')
  }
  return id
}

function threadTitle(value: string | undefined): string {
  return value?.trim() || '新任务'
}

function metadataString(thread: AgentControllerThread, key: string): string | undefined {
  const value = thread.metadata?.[key]
  return typeof value === 'string' && value ? value : undefined
}

function toIsoDate(value: unknown): string {
  try {
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'string' && value) return value
    if (typeof value === 'number') return new Date(value).toISOString()
    return new Date().toISOString()
  } catch {
    return new Date().toISOString()
  }
}

function summaryFromThread(
  thread: AgentControllerThread,
  session?: Session<MastraCodeState>
): RuntimeSessionSummary {
  const usage = session?.displayState.get().tokenUsage ?? thread.tokenUsage
  const tokenUsage = usage
    ? {
        promptTokens: usage.promptTokens ?? 0,
        completionTokens: usage.completionTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
        ...(usage.reasoningTokens !== undefined ? { reasoningTokens: usage.reasoningTokens } : {}),
        ...(usage.cachedInputTokens !== undefined
          ? { cachedInputTokens: usage.cachedInputTokens }
          : {})
      }
    : undefined

  return {
    id: thread.id,
    title: threadTitle(thread.title),
    pinned: thread.metadata?.[PINNED_KEY] === true,
    createdAt: toIsoDate(thread.createdAt),
    updatedAt: toIsoDate(thread.updatedAt),
    modelId:
      session?.model.hasSelection() === true
        ? session.model.get()
        : (metadataString(thread, 'currentModelId') ?? null),
    modeId: session?.mode.get() ?? metadataString(thread, 'currentModeId') ?? 'build',
    isRunning: session?.displayState.get().isRunning ?? false,
    ...(metadataString(thread, PROJECT_ID_KEY)
      ? { projectId: metadataString(thread, PROJECT_ID_KEY) }
      : {}),
    ...(metadataString(thread, PROJECT_PATH_KEY)
      ? { projectPath: metadataString(thread, PROJECT_PATH_KEY) }
      : {}),
    ...(tokenUsage ? { tokenUsage } : {})
  }
}

function eventErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Agent run failed.'
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

function accessRequest(
  toolCallId: string,
  toolName: string,
  suspendPayload: unknown
): RuntimeAccessRequest | undefined {
  const payload = record(suspendPayload)
  if (toolName !== 'request_access' && payload?.kind !== 'sandbox_access_request') return undefined
  return {
    toolCallId,
    path: typeof payload?.path === 'string' ? payload.path : '',
    reason: typeof payload?.reason === 'string' ? payload.reason : ''
  }
}

function pendingAccessRequests(session: Session<MastraCodeState>): RuntimeAccessRequest[] {
  const pending = session.displayState.get().pendingSuspensions
  if (!(pending instanceof Map)) return []
  return [...pending.values()].flatMap((suspension) => {
    const request = accessRequest(
      suspension.toolCallId,
      suspension.toolName,
      suspension.suspendPayload
    )
    return request ? [request] : []
  })
}

function selectedModelName(session: Session<MastraCodeState>): string | undefined {
  return session.model.hasSelection() ? session.model.displayName() : undefined
}

export function createRuntimeSessionService({
  controller,
  defaultSession,
  workspacePath,
  wireSession,
  activateSession
}: RuntimeSessionServiceDependencies): RuntimeSessionService & {
  resolveSession(sessionId: string): Promise<Session<MastraCodeState>>
} {
  const resourceId = defaultSession.identity.getResourceId()
  const ownerId = defaultSession.identity.getOwnerId()
  const materialized = new Map<string, MaterializedSession>()
  const listeners = new Set<RuntimeSessionEventListener>()

  const notify = (event: RuntimeSessionEvent): void => {
    for (const listener of listeners) {
      Promise.resolve(listener(event)).catch(() => undefined)
    }
  }

  const getThread = async (sessionId: string): Promise<AgentControllerThread> => {
    const thread = await defaultSession.thread.getById({ threadId: sessionId })
    if (
      !thread ||
      thread.resourceId !== resourceId ||
      thread.metadata?.[CLIENT_TAG] !== CLIENT_ID ||
      thread.metadata?.projectPath !== workspacePath
    ) {
      throw new Error(`Runtime session not found: ${sessionId}`)
    }
    return thread
  }

  const emitSummary = async (
    sessionId: string,
    session: Session<MastraCodeState>
  ): Promise<void> => {
    try {
      const thread = await getThread(sessionId)
      notify({ type: 'session_changed', session: summaryFromThread(thread, session) })
    } catch {
      // The thread may have been deleted while an event was still in flight.
    }
  }

  const handleEvent = (
    sessionId: string,
    session: Session<MastraCodeState>,
    event: AgentControllerEvent
  ): void => {
    if (
      event.type === 'message_start' ||
      event.type === 'message_update' ||
      event.type === 'message_end'
    ) {
      const message = toRuntimeSessionMessage(event.message, selectedModelName(session))
      if (message) {
        notify({
          type: 'message',
          sessionId,
          phase: event.type.slice('message_'.length) as 'start' | 'update' | 'end',
          message
        })
      }
      return
    }
    if (event.type === 'agent_start') {
      notify({ type: 'run_state', sessionId, isRunning: true })
      return
    }
    if (event.type === 'tool_suspended') {
      const request = accessRequest(event.toolCallId, event.toolName, event.suspendPayload)
      if (request) notify({ type: 'access_request', sessionId, request })
      return
    }
    if (event.type === 'tool_suspension_cancelled') {
      notify({
        type: 'access_request_resolved',
        sessionId,
        toolCallId: event.toolCallId,
        approved: false
      })
      return
    }
    if (event.type === 'agent_end') {
      notify({
        type: 'run_state',
        sessionId,
        isRunning: false,
        ...(event.reason ? { reason: event.reason } : {})
      })
      void emitSummary(sessionId, session)
      return
    }
    if (event.type === 'error') {
      notify({
        type: 'error',
        sessionId,
        message: eventErrorMessage(event.error),
        ...(event.retryable !== undefined ? { retryable: event.retryable } : {})
      })
      return
    }
    if (
      event.type === 'model_changed' ||
      event.type === 'mode_changed' ||
      event.type === 'om_thread_title_updated'
    ) {
      void emitSummary(sessionId, session)
    }
  }

  const ensureSession = async (sessionIdInput: string): Promise<Session<MastraCodeState>> => {
    const sessionId = requiredId(sessionIdInput)
    const current = materialized.get(sessionId)
    if (current) return current.session
    const thread = await getThread(sessionId)
    const projectId = metadataString(thread, PROJECT_ID_KEY)
    const projectPath = metadataString(thread, PROJECT_PATH_KEY) ?? workspacePath
    const session = await controller.createSession({
      resourceId,
      ownerId,
      id: sessionId,
      scope: `${SESSION_SCOPE_PREFIX}${sessionId}`,
      tags: {
        [CLIENT_TAG]: CLIENT_ID,
        [PROJECT_PATH_KEY]: projectPath,
        ...(projectId ? { [PROJECT_ID_KEY]: projectId } : {})
      },
      threadId: sessionId
    })
    await wireSession?.(session)
    const unsubscribe = session.subscribe((event) => handleEvent(sessionId, session, event))
    materialized.set(sessionId, { session, unsubscribe })
    return session
  }

  const snapshot = async (
    sessionId: string,
    session: Session<MastraCodeState>
  ): Promise<RuntimeSessionSnapshot> => {
    const [thread, storedMessages] = await Promise.all([
      getThread(sessionId),
      session.thread.listActiveMessages()
    ])
    return {
      ...summaryFromThread(thread, session),
      messages: storedMessages.flatMap((message) => {
        const mapped = toRuntimeSessionMessage(message, selectedModelName(session))
        return mapped ? [mapped] : []
      }),
      accessRequests: pendingAccessRequests(session)
    }
  }

  return {
    resolveSession: ensureSession,

    list: async () => {
      const threads = await defaultSession.thread.list({
        metadata: { [CLIENT_TAG]: CLIENT_ID, [PROJECT_PATH_KEY]: workspacePath }
      })
      return threads
        .map((thread) => summaryFromThread(thread, materialized.get(thread.id)?.session))
        .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    },

    listAll: async () => {
      const threads = await defaultSession.thread.list({
        allResources: true,
        metadata: { [CLIENT_TAG]: CLIENT_ID }
      })
      return threads
        .map((thread) => summaryFromThread(thread, materialized.get(thread.id)?.session))
        .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    },

    create: async (input: CreateRuntimeSessionInput = {}) => {
      const sessionId = requiredId(input.id ?? randomUUID())
      const existing = await defaultSession.thread.getById({ threadId: sessionId })
      if (existing) throw new Error(`Runtime session already exists: ${sessionId}`)

      const session = await controller.createSession({
        resourceId,
        ownerId,
        id: sessionId,
        scope: `${SESSION_SCOPE_PREFIX}${sessionId}`,
        tags: {
          [CLIENT_TAG]: CLIENT_ID,
          [PROJECT_PATH_KEY]: workspacePath,
          ...(input.projectId?.trim() ? { [PROJECT_ID_KEY]: input.projectId.trim() } : {})
        },
        threadId: sessionId
      })
      await wireSession?.(session)
      const unsubscribe = session.subscribe((event) => handleEvent(sessionId, session, event))
      materialized.set(sessionId, { session, unsubscribe })

      if (input.title?.trim()) {
        await session.thread.rename({ title: input.title.trim() })
      }
      if (input.modeId) await session.mode.switch({ modeId: input.modeId })
      if (input.modelId) {
        await session.model.switch({
          modelId: defineRuntimeModel(input.modelId),
          scope: 'thread'
        })
      }
      return snapshot(sessionId, session)
    },

    get: async (sessionIdInput) => {
      const sessionId = requiredId(sessionIdInput)
      return snapshot(sessionId, await ensureSession(sessionId))
    },

    update: async (input: UpdateRuntimeSessionInput) => {
      const sessionId = requiredId(input.sessionId)
      const session = await ensureSession(sessionId)
      activateSession?.(session)
      if (input.title !== undefined) {
        await session.thread.rename({ title: threadTitle(input.title) })
      }
      if (input.pinned !== undefined) {
        await session.thread.setSetting({ key: PINNED_KEY, value: input.pinned })
      }
      if (input.modeId !== undefined) {
        await session.mode.switch({ modeId: input.modeId })
      }
      if (input.modelId !== undefined) {
        await session.model.switch({
          modelId: defineRuntimeModel(input.modelId),
          scope: 'thread'
        })
      }
      const next = await snapshot(sessionId, session)
      notify({ type: 'session_changed', session: next })
      return next
    },

    delete: async (sessionIdInput) => {
      const sessionId = requiredId(sessionIdInput)
      const session = await ensureSession(sessionId)
      session.abort()
      await session.thread.delete({ threadId: sessionId })
      const current = materialized.get(sessionId)
      current?.unsubscribe()
      materialized.delete(sessionId)
      await controller.deleteSession({
        resourceId,
        scope: `${SESSION_SCOPE_PREFIX}${sessionId}`
      })
    },

    sendMessage: async (input: SendRuntimeSessionMessageInput) => {
      const sessionId = requiredId(input.sessionId)
      const session = await ensureSession(sessionId)
      activateSession?.(session)

      let content = input.content
      if (input.expertPrompt) {
        content = `[系统角色接管: 专家【${input.expertName ?? '专家'}】]\n${input.expertPrompt}\n\n[用户指令]:\n${content}`
      }
      if (input.goalMode) {
        content = `[自主目标执行模式 (Goal Mode 启动)]\n注意：用户已启用持续目标闭环执行模式。请自主拆解步骤、调用工具推进、自检验证，直至目标达成或产生明确最终交付物。不要半途停止等待非必要的确认。\n\n[目标任务]:\n${content}`
      }

      await session.sendMessage({
        content,
        ...(input.files?.length ? { files: input.files } : {})
      })
    },

    respondToAccessRequest: async (input) => {
      const sessionId = requiredId(input.sessionId)
      const toolCallId = requiredId(input.toolCallId)
      const session = await ensureSession(sessionId)
      const suspension = session.displayState.get().pendingSuspensions?.get(toolCallId)
      if (!suspension || suspension.toolName !== 'request_access') {
        throw new Error(`Pending access request not found: ${toolCallId}`)
      }
      activateSession?.(session)
      await session.respondToToolSuspension({
        toolCallId,
        resumeData: input.approved ? 'Yes' : 'No'
      })
      notify({
        type: 'access_request_resolved',
        sessionId,
        toolCallId,
        approved: input.approved
      })
    },

    abort: async (sessionIdInput) => {
      const sessionId = requiredId(sessionIdInput)
      const session = await ensureSession(sessionId)
      session.abort()
    },

    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    shutdown: async () => {
      const entries = [...materialized.entries()]
      materialized.clear()
      for (const [, entry] of entries) {
        entry.unsubscribe()
        entry.session.abort()
      }
      await Promise.all(
        entries.map(([sessionId]) =>
          controller.deleteSession({
            resourceId,
            scope: `${SESSION_SCOPE_PREFIX}${sessionId}`
          })
        )
      )
      listeners.clear()
    }
  }
}
