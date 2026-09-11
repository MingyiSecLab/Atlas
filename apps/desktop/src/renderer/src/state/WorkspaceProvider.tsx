import type {
  RuntimeSessionEvent,
  RuntimeSessionMessage,
  RuntimeSessionSnapshot,
  RuntimeSessionSummary as RuntimeSummary,
  RuntimeAccessRequest,
  RuntimeTokenUsage
} from '@mingyi/runtime'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type {
  DesktopProjectInfo,
  DesktopProjectOpenResult,
  DesktopWorkspaceInfo,
  RuntimeModeInfo
} from '../../../shared/runtime-ipc'
import type {
  ChatImageAttachment,
  ChatMessage,
  ChatTimelineItem,
  ImageMimeType
} from '../components/chat/types'
import {
  createOptimisticSkillMessage,
  createOptimisticUserMessage,
  mergeTimelineMessage
} from './chat-timeline'
import { parseSkillActivation } from '../components/chat/skills/skill-activation'

export interface SessionSummary {
  id: string
  title: string
  pinned: boolean
  createdAt: string
  updatedAt: string
  modelId: string
  permissionProfileId: string
  isRunning: boolean
  projectId?: string
  projectPath?: string
  tokenUsage?: RuntimeTokenUsage
}

export interface SessionSnapshot extends SessionSummary {
  timeline: ChatTimelineItem[]
  accessRequests: RuntimeAccessRequest[]
  loaded: boolean
}

interface CreateSessionInput {
  title?: string
  modelId?: string
  permissionProfileId?: string
  projectId?: string
}

interface UpdateSessionInput {
  sessionId: string
  title?: string
  pinned?: boolean
  modelId?: string
  permissionProfileId?: string
}

interface SendMessageInput {
  sessionId: string
  text: string
  attachments?: ChatImageAttachment[]
  goalMode?: boolean
  expertPrompt?: string
  expertName?: string
}

interface InvokeSkillInput {
  sessionId: string
  skillName: string
  arguments: string
  attachments?: ChatImageAttachment[]
}

interface RespondAccessRequestInput {
  sessionId: string
  toolCallId: string
  approved: boolean
}

interface WorkspaceContextValue {
  workspace: DesktopWorkspaceInfo | null
  projects: DesktopProjectInfo[]
  isLoading: boolean
  error: string | null
  modelIds: string[]
  modes: RuntimeModeInfo[]
  sessions: SessionSummary[]
  snapshots: Record<string, SessionSnapshot>
  selectWorkspace(): Promise<void>
  reloadProjects(): Promise<void>
  createProject(input: { rootPath: string; name?: string }): Promise<DesktopProjectInfo>
  openProject(projectId: string): Promise<DesktopProjectOpenResult>
  renameProject(projectId: string, name: string): Promise<void>
  removeProject(projectId: string): Promise<void>
  loadSession(sessionId: string): Promise<SessionSnapshot>
  createSession(input: CreateSessionInput): Promise<SessionSnapshot>
  updateSession(input: UpdateSessionInput): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  sendMessage(input: SendMessageInput): Promise<void>
  invokeSkill(input: InvokeSkillInput): Promise<void>
  respondToAccessRequest(input: RespondAccessRequestInput): Promise<void>
  abortSession(sessionId: string): Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

const DEFAULT_MODES: RuntimeModeInfo[] = [
  { id: 'build', name: 'Build', description: '代码实现与构建模式' },
  { id: 'plan', name: 'Plan', description: '任务规划与架构分析' },
  { id: 'fast', name: 'Fast', description: '极速响应与简短问答' },
  { id: 'pentest', name: 'Pentest', description: '安全渗透测试与授权证据采集' },
  { id: 'audit', name: 'Audit', description: '代码质量与安全审计审查' }
]

let cachedModes: RuntimeModeInfo[] = DEFAULT_MODES

function permissionFromMode(modeId?: string): string {
  if (!modeId) return 'Build'
  const matched = cachedModes.find((m) => m.id.toLowerCase() === modeId.toLowerCase())
  if (matched?.name) return matched.name
  if (modeId === 'plan') return 'Plan'
  if (modeId === 'fast') return 'Fast'
  if (modeId === 'build') return 'Build'
  if (modeId === 'pentest') return 'Pentest'
  if (modeId === 'audit') return 'Audit'
  return modeId.charAt(0).toUpperCase() + modeId.slice(1)
}

function modeIdFromPermission(permission?: string): string | undefined {
  if (!permission) return undefined
  const matched = cachedModes.find(
    (m) =>
      m.name.toLowerCase() === permission.toLowerCase() ||
      m.id.toLowerCase() === permission.toLowerCase()
  )
  if (matched?.id) return matched.id
  if (permission.toLowerCase() === 'plan') return 'plan'
  if (permission.toLowerCase() === 'fast') return 'fast'
  if (permission.toLowerCase() === 'build') return 'build'
  if (permission.toLowerCase() === 'pentest') return 'pentest'
  if (permission.toLowerCase() === 'audit') return 'audit'
  return permission.toLowerCase()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isImageMimeType(value: string): value is ImageMimeType {
  return (
    value === 'image/jpeg' ||
    value === 'image/png' ||
    value === 'image/gif' ||
    value === 'image/webp'
  )
}

function formatTimestamp(value: unknown): string {
  try {
    const date = value ? new Date(value as string | number | Date) : new Date()
    if (Number.isNaN(date.getTime())) return '刚刚'
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return '刚刚'
  }
}

function runtimeMessage(message: RuntimeSessionMessage, isStreaming = false): ChatMessage {
  const attachments = Array.isArray(message.attachments)
    ? message.attachments.flatMap((attachment) =>
        isImageMimeType(attachment.mediaType)
          ? [
              {
                id: attachment.id,
                name: attachment.name,
                mimeType: attachment.mediaType,
                sizeBytes: attachment.sizeBytes ?? 0,
                url: attachment.dataUrl
              }
            ]
          : []
      )
    : []

  const rawBlocks = Array.isArray(message.blocks) ? message.blocks : []
  const blocks = rawBlocks.map((block) => {
    if (!block || typeof block !== 'object') {
      return { type: 'text' as const, text: String(block ?? '') }
    }
    if (block.type === 'text') {
      const text = typeof block.text === 'string' ? block.text : ''
      const skill = message.role === 'user' ? parseSkillActivation(text) : undefined
      return skill ?? { type: 'text' as const, text }
    }
    if (block.type === 'reasoning') {
      return {
        type: 'reasoning' as const,
        text: typeof block.text === 'string' ? block.text : '',
        isStreaming
      }
    }
    return {
      type: 'tool' as const,
      id: block.id,
      name: block.name || 'tool',
      ...(block.input ? { input: block.input } : {}),
      ...(block.output ? { output: block.output } : {}),
      status: block.status || 'success'
    }
  })

  return {
    id: message.id,
    role: message.role,
    blocks,
    ...(attachments.length ? { attachments } : {}),
    timestamp: formatTimestamp(message.createdAt),
    ...(message.role === 'assistant'
      ? { isStreaming, ...(message.modelName ? { modelName: message.modelName } : {}) }
      : {})
  }
}

function sessionSummary(summary: RuntimeSummary): SessionSummary {
  return {
    id: summary.id,
    title: summary.title,
    pinned: summary.pinned,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    modelId: summary.modelId ?? '未选择模型',
    permissionProfileId: permissionFromMode(summary.modeId),
    isRunning: summary.isRunning,
    ...(summary.projectId ? { projectId: summary.projectId } : {}),
    ...(summary.projectPath ? { projectPath: summary.projectPath } : {}),
    ...(summary.tokenUsage ? { tokenUsage: summary.tokenUsage } : {})
  }
}

function setToolStatus(
  timeline: ChatTimelineItem[],
  toolCallId: string,
  status: 'waiting_approval' | 'running' | 'denied'
): ChatTimelineItem[] {
  return timeline.map((item) =>
    item.role === 'assistant'
      ? {
          ...item,
          blocks: (item.blocks ?? []).map((block) =>
            block.type === 'tool' && block.id === toolCallId ? { ...block, status } : block
          )
        }
      : item
  )
}

function sessionSnapshot(snapshot: RuntimeSessionSnapshot): SessionSnapshot {
  const rawMessages = Array.isArray(snapshot?.messages) ? snapshot.messages : []
  let timeline: ChatTimelineItem[] = rawMessages.map((message) => runtimeMessage(message))
  const accessRequests = Array.isArray(snapshot?.accessRequests) ? snapshot.accessRequests : []
  for (const request of accessRequests) {
    if (request?.toolCallId) {
      timeline = setToolStatus(timeline, request.toolCallId, 'waiting_approval')
    }
  }
  return {
    ...sessionSummary(snapshot),
    timeline,
    accessRequests,
    loaded: true
  }
}

function placeholder(summary: RuntimeSummary): SessionSnapshot {
  return { ...sessionSummary(summary), timeline: [], accessRequests: [], loaded: false }
}

function summaryFromSnapshot(snapshot: SessionSnapshot): SessionSummary {
  return {
    id: snapshot.id,
    title: snapshot.title,
    pinned: snapshot.pinned,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    modelId: snapshot.modelId,
    permissionProfileId: snapshot.permissionProfileId,
    isRunning: snapshot.isRunning,
    ...(snapshot.projectId ? { projectId: snapshot.projectId } : {}),
    ...(snapshot.projectPath ? { projectPath: snapshot.projectPath } : {}),
    ...(snapshot.tokenUsage ? { tokenUsage: snapshot.tokenUsage } : {})
  }
}

function sortSessions(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((first, second) => {
    const pinned = Number(second.pinned) - Number(first.pinned)
    return pinned || second.updatedAt.localeCompare(first.updatedAt)
  })
}

function dataUrlPayload(url: string): string {
  const comma = url.indexOf(',')
  if (!url.startsWith('data:') || comma < 0) throw new Error('Invalid attachment data URL.')
  return url.slice(comma + 1)
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }): React.ReactNode {
  const [workspace, setWorkspace] = useState<DesktopWorkspaceInfo | null>(null)
  const [projects, setProjects] = useState<DesktopProjectInfo[]>([])
  const [snapshots, setSnapshots] = useState<Record<string, SessionSnapshot>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modelIds, setModelIds] = useState<string[]>([])
  const [modes, setModes] = useState<RuntimeModeInfo[]>(DEFAULT_MODES)

  const applyEvent = useCallback((event: RuntimeSessionEvent): void => {
    setSnapshots((current) => {
      if (event.type === 'session_changed') {
        const existing = current[event.session.id]
        return {
          ...current,
          [event.session.id]: existing
            ? { ...existing, ...sessionSummary(event.session) }
            : placeholder(event.session)
        }
      }
      const snapshot = current[event.sessionId]
      if (!snapshot) return current
      if (event.type === 'message') {
        const mapped = runtimeMessage(
          event.message,
          event.phase !== 'end' && event.message.role === 'assistant'
        )
        return {
          ...current,
          [event.sessionId]: {
            ...snapshot,
            loaded: true,
            updatedAt: new Date().toISOString(),
            timeline: mergeTimelineMessage(snapshot.timeline, mapped)
          }
        }
      }
      if (event.type === 'access_request') {
        const requests = snapshot.accessRequests.filter(
          (request) => request.toolCallId !== event.request.toolCallId
        )
        return {
          ...current,
          [event.sessionId]: {
            ...snapshot,
            accessRequests: [...requests, event.request],
            timeline: setToolStatus(snapshot.timeline, event.request.toolCallId, 'waiting_approval')
          }
        }
      }
      if (event.type === 'access_request_resolved') {
        return {
          ...current,
          [event.sessionId]: {
            ...snapshot,
            accessRequests: snapshot.accessRequests.filter(
              (request) => request.toolCallId !== event.toolCallId
            ),
            timeline: setToolStatus(
              snapshot.timeline,
              event.toolCallId,
              event.approved ? 'running' : 'denied'
            )
          }
        }
      }
      if (event.type === 'run_state') {
        return {
          ...current,
          [event.sessionId]: {
            ...snapshot,
            isRunning: event.isRunning,
            timeline: event.isRunning
              ? snapshot.timeline
              : snapshot.timeline.map((item) =>
                  item.role === 'assistant' ? { ...item, isStreaming: false } : item
                )
          }
        }
      }
      if (event.type === 'error') {
        const message: ChatTimelineItem = {
          id: `error-${crypto.randomUUID()}`,
          role: 'error',
          content: event.message
        }
        return {
          ...current,
          [event.sessionId]: {
            ...snapshot,
            isRunning: false,
            timeline: [...snapshot.timeline, message]
          }
        }
      }
      return current
    })
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const [nextWorkspace, summaries, models, availableModes, nextProjects] = await Promise.all([
        window.api.workspace.get(),
        window.api.sessions.list(),
        window.api.models.list(),
        window.api.modes.list().catch(() => DEFAULT_MODES),
        window.api.projects.list().catch(() => [])
      ])
      setWorkspace(nextWorkspace)
      setProjects(nextProjects)
      setModelIds(models.filter((model) => model.hasApiKey).map((model) => model.id))
      const resolvedModes = availableModes?.length ? availableModes : DEFAULT_MODES
      cachedModes = resolvedModes
      setModes(resolvedModes)
      setSnapshots((current) =>
        Object.fromEntries(
          summaries.map((summary) => [
            summary.id,
            current[summary.id]
              ? { ...current[summary.id], ...sessionSummary(summary) }
              : placeholder(summary)
          ])
        )
      )
    } catch (refreshError) {
      setError(errorMessage(refreshError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const unsubscribeEvent = window.api.sessions.onEvent(applyEvent)
    const unsubscribeWorkspace = window.api.workspace.onChanged((nextWorkspace) => {
      setWorkspace(nextWorkspace)
      void refresh()
    })
    const unsubscribeProviders = window.api.providers.onChanged(() => {
      void refresh()
    })
    queueMicrotask(() => void refresh())
    return () => {
      unsubscribeEvent()
      unsubscribeWorkspace()
      unsubscribeProviders()
    }
  }, [applyEvent, refresh])

  const selectWorkspace = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      const selected = await window.api.workspace.select()
      if (!selected) return
      setWorkspace(selected)
      await refresh()
    } catch (selectError) {
      setError(errorMessage(selectError))
    }
  }, [refresh])

  const reloadProjects = useCallback(async (): Promise<void> => {
    try {
      setProjects(await window.api.projects.list())
    } catch (projectsError) {
      setError(errorMessage(projectsError))
    }
  }, [])

  const createProject = useCallback(
    async (input: { rootPath: string; name?: string }): Promise<DesktopProjectInfo> => {
      setError(null)
      try {
        const project = await window.api.projects.create(input)
        await reloadProjects()
        return project
      } catch (createError) {
        setError(errorMessage(createError))
        throw createError
      }
    },
    [reloadProjects]
  )

  const openProject = useCallback(
    async (projectId: string): Promise<DesktopProjectOpenResult> => {
      setError(null)
      try {
        const result = await window.api.projects.open(projectId)
        setWorkspace(result.workspace)
        await refresh()
        return result
      } catch (openError) {
        setError(errorMessage(openError))
        throw openError
      }
    },
    [refresh]
  )

  const renameProject = useCallback(
    async (projectId: string, name: string): Promise<void> => {
      setError(null)
      try {
        await window.api.projects.rename(projectId, name)
        await reloadProjects()
      } catch (renameError) {
        setError(errorMessage(renameError))
        throw renameError
      }
    },
    [reloadProjects]
  )

  const removeProject = useCallback(
    async (projectId: string): Promise<void> => {
      setError(null)
      try {
        await window.api.projects.remove(projectId)
        await reloadProjects()
      } catch (removeError) {
        setError(errorMessage(removeError))
        throw removeError
      }
    },
    [reloadProjects]
  )

  const loadSession = useCallback(async (sessionId: string): Promise<SessionSnapshot> => {
    try {
      const next = sessionSnapshot(await window.api.sessions.get(sessionId))
      setSnapshots((current) => ({ ...current, [sessionId]: next }))
      return next
    } catch (loadError) {
      setError(errorMessage(loadError))
      throw loadError
    }
  }, [])

  const createSession = useCallback(async (input: CreateSessionInput): Promise<SessionSnapshot> => {
    setError(null)
    const modeId = modeIdFromPermission(input.permissionProfileId)
    const modelId = input.modelId?.includes('/') ? input.modelId : undefined
    try {
      const next = sessionSnapshot(
        await window.api.sessions.create({
          ...(input.title ? { title: input.title } : {}),
          ...(modelId ? { modelId } : {}),
          ...(modeId ? { modeId } : {}),
          ...(input.projectId ? { projectId: input.projectId } : {})
        })
      )
      setSnapshots((current) => ({ ...current, [next.id]: next }))
      return next
    } catch (createError) {
      setError(errorMessage(createError))
      throw createError
    }
  }, [])

  const updateSession = useCallback(async (input: UpdateSessionInput): Promise<void> => {
    const modeId = modeIdFromPermission(input.permissionProfileId)
    try {
      const next = await window.api.sessions.update({
        sessionId: input.sessionId,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
        ...(input.modelId !== undefined && input.modelId.includes('/')
          ? { modelId: input.modelId }
          : {}),
        ...(modeId ? { modeId } : {})
      })
      setSnapshots((current) => {
        const existing = current[input.sessionId]
        return {
          ...current,
          [input.sessionId]: existing
            ? { ...existing, ...sessionSummary(next) }
            : sessionSnapshot(next)
        }
      })
    } catch (updateError) {
      setError(errorMessage(updateError))
      throw updateError
    }
  }, [])

  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    try {
      await window.api.sessions.delete(sessionId)
      setSnapshots((current) => {
        if (!current[sessionId]) return current
        const next = { ...current }
        delete next[sessionId]
        return next
      })
    } catch (deleteError) {
      setError(errorMessage(deleteError))
      throw deleteError
    }
  }, [])

  const sendMessage = useCallback(async (input: SendMessageInput): Promise<void> => {
    setError(null)
    const optimisticMessage = createOptimisticUserMessage(input.text, input.attachments)
    setSnapshots((current) => {
      const snapshot = current[input.sessionId]
      if (!snapshot) return current
      const updatedAt = new Date().toISOString()
      return {
        ...current,
        [input.sessionId]: {
          ...snapshot,
          isRunning: true,
          updatedAt,
          timeline: mergeTimelineMessage(snapshot.timeline, optimisticMessage)
        }
      }
    })
    try {
      await window.api.sessions.sendMessage({
        sessionId: input.sessionId,
        content: input.text,
        ...(input.goalMode ? { goalMode: input.goalMode } : {}),
        ...(input.expertPrompt ? { expertPrompt: input.expertPrompt } : {}),
        ...(input.expertName ? { expertName: input.expertName } : {}),
        ...(input.attachments?.length
          ? {
              files: input.attachments.map((attachment) => ({
                data: dataUrlPayload(attachment.url),
                mediaType: attachment.mimeType,
                filename: attachment.name
              }))
            }
          : {})
      })
    } catch (sendError) {
      setSnapshots((current) => {
        const snapshot = current[input.sessionId]
        if (!snapshot) return current
        return {
          ...current,
          [input.sessionId]: {
            ...snapshot,
            isRunning: false
          }
        }
      })
      setError(errorMessage(sendError))
      throw sendError
    }
  }, [])

  const invokeSkill = useCallback(async (input: InvokeSkillInput): Promise<void> => {
    setError(null)
    const optimisticMessage = createOptimisticSkillMessage(
      input.skillName,
      input.arguments,
      input.attachments
    )
    setSnapshots((current) => {
      const snapshot = current[input.sessionId]
      if (!snapshot) return current
      return {
        ...current,
        [input.sessionId]: {
          ...snapshot,
          isRunning: true,
          updatedAt: new Date().toISOString(),
          timeline: mergeTimelineMessage(snapshot.timeline, optimisticMessage)
        }
      }
    })
    try {
      await window.api.skills.invoke({
        sessionId: input.sessionId,
        name: input.skillName,
        arguments: input.arguments,
        ...(input.attachments?.length
          ? {
              files: input.attachments.map((attachment) => ({
                data: dataUrlPayload(attachment.url),
                mediaType: attachment.mimeType,
                filename: attachment.name
              }))
            }
          : {})
      })
    } catch (invokeError) {
      setSnapshots((current) => {
        const snapshot = current[input.sessionId]
        if (!snapshot) return current
        return {
          ...current,
          [input.sessionId]: {
            ...snapshot,
            isRunning: false
          }
        }
      })
      setError(errorMessage(invokeError))
      throw invokeError
    }
  }, [])

  const respondToAccessRequest = useCallback(
    async (input: RespondAccessRequestInput): Promise<void> => {
      setError(null)
      try {
        await window.api.sessions.respondToAccessRequest(input)
      } catch (responseError) {
        setError(errorMessage(responseError))
        throw responseError
      }
    },
    []
  )

  const abortSession = useCallback(async (sessionId: string): Promise<void> => {
    try {
      await window.api.sessions.abort(sessionId)
    } catch (abortError) {
      setError(errorMessage(abortError))
      throw abortError
    }
  }, [])

  const sessions = useMemo(
    () => sortSessions(Object.values(snapshots).map(summaryFromSnapshot)),
    [snapshots]
  )

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      projects,
      isLoading,
      error,
      modelIds,
      modes,
      sessions,
      snapshots,
      selectWorkspace,
      reloadProjects,
      createProject,
      openProject,
      renameProject,
      removeProject,
      loadSession,
      createSession,
      updateSession,
      deleteSession,
      sendMessage,
      invokeSkill,
      respondToAccessRequest,
      abortSession
    }),
    [
      workspace,
      projects,
      isLoading,
      error,
      modelIds,
      modes,
      sessions,
      snapshots,
      selectWorkspace,
      reloadProjects,
      createProject,
      openProject,
      renameProject,
      removeProject,
      loadSession,
      createSession,
      updateSession,
      deleteSession,
      sendMessage,
      invokeSkill,
      respondToAccessRequest,
      abortSession
    ]
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

// Context hooks intentionally share this module with their provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return value
}
