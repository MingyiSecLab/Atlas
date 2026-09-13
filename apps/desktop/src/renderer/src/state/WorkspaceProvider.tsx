import type {
  RuntimeSessionEvent,
  RuntimeSessionSnapshot,
  RuntimeSessionSummary as RuntimeSummary,
  RuntimeTokenUsage
} from '@mingyi/runtime'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type {
  DesktopProjectInfo,
  DesktopProjectOpenResult,
  DesktopWorkspaceInfo,
  RuntimeModeInfo
} from '../../../shared/runtime-ipc'

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

/**
 * WorkspaceProvider 现在只承载 Shell 级状态（工作区/项目/模型/模式/会话摘要）。
 * 消息 timeline、审批状态与乐观消息合并已迁移到
 * components/chat/runtime/（assistant-ui LocalRuntime）。
 */

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

export interface SendMessageInput {
  sessionId: string
  text: string
  attachments?: Array<{ name: string; mimeType: string; url: string }>
  goalMode?: boolean
  expertPrompt?: string
  expertName?: string
}

export interface InvokeSkillInput {
  sessionId: string
  skillName: string
  arguments: string
  attachments?: Array<{ name: string; mimeType: string; url: string }>
}

export interface RespondAccessRequestInput {
  sessionId: string
  toolCallId: string
  approved: boolean
}

export interface WorkspaceContextValue {
  workspace: DesktopWorkspaceInfo | null
  projects: DesktopProjectInfo[]
  isLoading: boolean
  error: string | null
  modelIds: string[]
  modes: RuntimeModeInfo[]
  sessions: SessionSummary[]
  snapshots: Record<string, SessionSummary>
  clearError: () => void
  selectWorkspace: () => Promise<void>
  reloadProjects: () => Promise<void>
  createProject: (input: { rootPath: string; name?: string }) => Promise<DesktopProjectInfo>
  openProject: (projectId: string) => Promise<DesktopProjectOpenResult>
  renameProject: (projectId: string, name: string) => Promise<void>
  removeProject: (projectId: string) => Promise<void>
  loadSession: (sessionId: string) => Promise<SessionSummary>
  createSession: (input: CreateSessionInput) => Promise<SessionSummary>
  updateSession: (input: UpdateSessionInput) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  sendMessage: (input: SendMessageInput) => Promise<void>
  invokeSkill: (input: InvokeSkillInput) => Promise<void>
  respondToAccessRequest: (input: RespondAccessRequestInput) => Promise<void>
  abortSession: (sessionId: string) => Promise<void>
}

const DEFAULT_MODES: RuntimeModeInfo[] = [
  { id: 'pentest', name: 'Pentest', description: '渗透测试' },
  { id: 'audit', name: 'Audit', description: '安全审计' }
]

const PERMISSION_BY_MODE: Record<string, string> = {
  pentest: 'Pentest',
  audit: 'Audit'
}

const MODE_BY_PERMISSION: Record<string, string> = {
  Pentest: 'pentest',
  Audit: 'audit'
}

function permissionFromMode(modeId: string | null | undefined): string {
  return (modeId && PERMISSION_BY_MODE[modeId]) || 'Pentest'
}

function modeIdFromPermission(permissionProfileId: string | undefined): string | undefined {
  return permissionProfileId ? MODE_BY_PERMISSION[permissionProfileId] : undefined
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
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

function dataUrlPayload(url: string): string {
  const comma = url.indexOf(',')
  if (!url.startsWith('data:') || comma < 0) throw new Error('Invalid attachment data URL.')
  return url.slice(comma + 1)
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: React.ReactNode }): React.ReactNode {
  const [workspace, setWorkspace] = useState<DesktopWorkspaceInfo | null>(null)
  const [projects, setProjects] = useState<DesktopProjectInfo[]>([])
  const [snapshots, setSnapshots] = useState<Record<string, SessionSummary>>({})
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
            : sessionSummary(event.session)
        }
      }
      const snapshot = current[event.sessionId]
      if (!snapshot) return current
      if (event.type === 'run_state') {
        return {
          ...current,
          [event.sessionId]: { ...snapshot, isRunning: event.isRunning }
        }
      }
      return current
    })
  }, [])

  const clearError = useCallback((): void => {
    setError(null)
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
      setModes(availableModes?.length ? availableModes : DEFAULT_MODES)
      setSnapshots((current) =>
        Object.fromEntries(
          summaries.map((summary) => [
            summary.id,
            current[summary.id]
              ? { ...current[summary.id], ...sessionSummary(summary) }
              : sessionSummary(summary)
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

  const loadSession = useCallback(async (sessionId: string): Promise<SessionSummary> => {
    try {
      const next = sessionSummary(await window.api.sessions.get(sessionId))
      setSnapshots((current) => ({ ...current, [sessionId]: next }))
      return next
    } catch (loadError) {
      setError(errorMessage(loadError))
      throw loadError
    }
  }, [])

  const createSession = useCallback(async (input: CreateSessionInput): Promise<SessionSummary> => {
    setError(null)
    const modeId = modeIdFromPermission(input.permissionProfileId)
    const modelId = input.modelId?.includes('/') ? input.modelId : undefined
    try {
      const created = await window.api.sessions.create({
        ...(input.title ? { title: input.title } : {}),
        ...(modelId ? { modelId } : {}),
        ...(modeId ? { modeId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {})
      })
      const next = sessionSummary(created as RuntimeSessionSnapshot)
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
            : sessionSummary(next)
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
    setSnapshots((current) => {
      const snapshot = current[input.sessionId]
      if (!snapshot) return current
      return {
        ...current,
        [input.sessionId]: {
          ...snapshot,
          isRunning: true,
          updatedAt: new Date().toISOString()
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
    setSnapshots((current) => {
      const snapshot = current[input.sessionId]
      if (!snapshot) return current
      return {
        ...current,
        [input.sessionId]: {
          ...snapshot,
          isRunning: true,
          updatedAt: new Date().toISOString()
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
    () =>
      [...Object.values(snapshots)].sort((first, second) => {
        const pinned = Number(second.pinned) - Number(first.pinned)
        return pinned || second.updatedAt.localeCompare(first.updatedAt)
      }),
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
      clearError,
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
      clearError,
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
