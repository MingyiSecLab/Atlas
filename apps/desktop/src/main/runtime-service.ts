import type {
  CreateRuntimeSessionInput,
  InvokeRuntimeSkillInput,
  ListRuntimeSkillsInput,
  LocalRuntimeInstance,
  RespondRuntimeAccessRequestInput,
  RuntimeSessionEvent,
  SendRuntimeSessionMessageInput,
  SearchRuntimeSkillsInput,
  UpdateRuntimeOmInput,
  UpdateRuntimeSessionInput,
  RuntimeMcpServerConfig,
  RuntimeMcpProjectConfig
} from '@mingyi/runtime'
import type { WebContents } from 'electron'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { RUNTIME_IPC, type DesktopWorkspaceInfo } from '../shared/runtime-ipc'
import type { DesktopRuntimeManager } from './runtime-manager'

const MAX_FILES = 8
const MAX_FILE_BASE64_LENGTH = 16 * 1024 * 1024

function workspaceInfo(path: string): DesktopWorkspaceInfo {
  return { path, name: basename(path) || path }
}

function sessionId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid session ID.')
  return value.trim()
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${field} must be a string.`)
  return value
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(`${field} must be a non-empty string.`)
  }
  return value.trim()
}

function createInput(value: unknown): CreateRuntimeSessionInput {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object') throw new Error('Invalid session create request.')
  const input = value as Record<string, unknown>
  return {
    ...(input.id !== undefined ? { id: sessionId(input.id) } : {}),
    ...(input.title !== undefined ? { title: optionalString(input.title, 'title') } : {}),
    ...(input.modelId !== undefined ? { modelId: optionalString(input.modelId, 'modelId') } : {}),
    ...(input.modeId !== undefined ? { modeId: optionalString(input.modeId, 'modeId') } : {}),
    ...(input.projectId !== undefined
      ? { projectId: requiredString(input.projectId, 'projectId', 200) }
      : {})
  }
}

function updateInput(value: unknown): UpdateRuntimeSessionInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid session update request.')
  const input = value as Record<string, unknown>
  if (input.pinned !== undefined && typeof input.pinned !== 'boolean') {
    throw new Error('pinned must be a boolean.')
  }
  return {
    sessionId: sessionId(input.sessionId),
    ...(input.title !== undefined ? { title: optionalString(input.title, 'title') } : {}),
    ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
    ...(input.modelId !== undefined ? { modelId: optionalString(input.modelId, 'modelId') } : {}),
    ...(input.modeId !== undefined ? { modeId: optionalString(input.modeId, 'modeId') } : {})
  }
}

function messageFiles(value: unknown): SendRuntimeSessionMessageInput['files'] {
  if (value !== undefined && !Array.isArray(value)) {
    throw new Error('Message files must be an array.')
  }
  if (Array.isArray(value) && value.length > MAX_FILES) {
    throw new Error(`A message can contain at most ${MAX_FILES} files.`)
  }
  return (value as unknown[] | undefined)?.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') throw new Error('Invalid message file.')
    const file = candidate as Record<string, unknown>
    if (
      typeof file.data !== 'string' ||
      !file.data ||
      file.data.length > MAX_FILE_BASE64_LENGTH ||
      typeof file.mediaType !== 'string' ||
      !file.mediaType.startsWith('image/')
    ) {
      throw new Error('Invalid message file data.')
    }
    return {
      data: file.data,
      mediaType: file.mediaType,
      ...(typeof file.filename === 'string' ? { filename: file.filename } : {})
    }
  })
}

function sendInput(value: unknown): SendRuntimeSessionMessageInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid message request.')
  const input = value as Record<string, unknown>
  if (typeof input.content !== 'string') throw new Error('Message content must be a string.')
  const files = messageFiles(input.files)
  if (!input.content.trim() && !files?.length) throw new Error('Message must not be empty.')
  return {
    sessionId: sessionId(input.sessionId),
    content: input.content,
    ...(files?.length ? { files } : {}),
    ...(typeof input.goalMode === 'boolean' ? { goalMode: input.goalMode } : {}),
    ...(typeof input.expertPrompt === 'string' ? { expertPrompt: input.expertPrompt } : {}),
    ...(typeof input.expertName === 'string' ? { expertName: input.expertName } : {})
  }
}

function optionalSessionId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return sessionId(value)
}

function skillListInput(value: unknown): ListRuntimeSkillsInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid skill list request.')
  const input = value as Record<string, unknown>
  if (input.refresh !== undefined && typeof input.refresh !== 'boolean') {
    throw new Error('refresh must be a boolean.')
  }
  const skillSessionId = optionalSessionId(input.sessionId)
  return {
    ...(skillSessionId ? { sessionId: skillSessionId } : {}),
    ...(input.refresh !== undefined ? { refresh: input.refresh } : {})
  }
}

function accessResponseInput(value: unknown): RespondRuntimeAccessRequestInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid access response request.')
  const input = value as Record<string, unknown>
  if (typeof input.approved !== 'boolean') throw new Error('approved must be a boolean.')
  return {
    sessionId: sessionId(input.sessionId),
    toolCallId: requiredString(input.toolCallId, 'toolCallId', 256),
    approved: input.approved
  }
}

function skillSearchInput(value: unknown): SearchRuntimeSkillsInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid skill search request.')
  const input = value as Record<string, unknown>
  if (
    input.topK !== undefined &&
    (!Number.isInteger(input.topK) || Number(input.topK) < 1 || Number(input.topK) > 50)
  ) {
    throw new Error('topK must be an integer between 1 and 50.')
  }
  return {
    ...(optionalSessionId(input.sessionId)
      ? { sessionId: optionalSessionId(input.sessionId) }
      : {}),
    query: requiredString(input.query, 'query', 500),
    ...(input.topK !== undefined ? { topK: Number(input.topK) } : {})
  }
}

function skillInvokeInput(value: unknown): InvokeRuntimeSkillInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid skill invocation request.')
  const input = value as Record<string, unknown>
  const files = messageFiles(input.files)
  return {
    sessionId: sessionId(input.sessionId),
    name: requiredString(input.name, 'name', 256),
    ...(input.arguments !== undefined
      ? { arguments: optionalString(input.arguments, 'arguments') }
      : {}),
    ...(files?.length ? { files } : {})
  }
}

function mcpName(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value.trim())) {
    throw new Error('Invalid MCP server name.')
  }
  return value.trim()
}

function stringRecord(value: unknown, field: string): Record<string, string> | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${field} must be an object.`)
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (!key || key.length > 200 || typeof item !== 'string' || item.length > 16_000) {
      throw new Error(`Invalid MCP ${field} entry.`)
    }
    result[key] = item
  }
  return result
}

function mcpConfig(value: unknown): RuntimeMcpServerConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid MCP server config.')
  const input = value as Record<string, unknown>
  if (typeof input.command === 'string') {
    if (!input.command.trim() || input.command.length > 2_000)
      throw new Error('Invalid MCP command.')
    if (
      input.args !== undefined &&
      (!Array.isArray(input.args) ||
        input.args.some((arg) => typeof arg !== 'string' || arg.length > 2_000))
    ) {
      throw new Error('MCP args must be an array of strings.')
    }
    return {
      command: input.command.trim(),
      ...(input.args ? { args: input.args as string[] } : {}),
      ...(stringRecord(input.env, 'environment')
        ? { env: stringRecord(input.env, 'environment') }
        : {})
    }
  }
  if (typeof input.url !== 'string' || input.url.length > 4_000) throw new Error('Invalid MCP URL.')
  const url = new URL(input.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('MCP URL must use http or https.')
  return {
    url: url.toString(),
    ...(stringRecord(input.headers, 'header')
      ? { headers: stringRecord(input.headers, 'header') }
      : {}),
    ...(input.oauth && typeof input.oauth === 'object' ? { oauth: input.oauth as never } : {})
  }
}

function mcpUpdateInput(value: unknown): { name: string; config: RuntimeMcpServerConfig } {
  if (!value || typeof value !== 'object') throw new Error('Invalid MCP upsert request.')
  const input = value as Record<string, unknown>
  return { name: mcpName(input.name), config: mcpConfig(input.config) }
}

function mcpProjectConfigInput(value: unknown): RuntimeMcpProjectConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MCP project config must be a JSON object.')
  }
  if (JSON.stringify(value).length > 256_000) throw new Error('MCP project config is too large.')
  const input = value as Record<string, unknown>
  if (
    !input.mcpServers ||
    typeof input.mcpServers !== 'object' ||
    Array.isArray(input.mcpServers)
  ) {
    throw new Error('MCP project config must contain an mcpServers object.')
  }
  return { mcpServers: input.mcpServers as RuntimeMcpProjectConfig['mcpServers'] }
}

function mcpSetAllDisabledInput(value: unknown): {
  disabled: boolean
  scope?: 'project' | 'global'
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid MCP all-disabled request.')
  }
  const input = value as Record<string, unknown>
  if (typeof input.disabled !== 'boolean') throw new Error('disabled must be a boolean.')
  if (input.scope !== undefined && input.scope !== 'project' && input.scope !== 'global') {
    throw new Error('Invalid MCP scope.')
  }
  return { disabled: input.disabled, scope: input.scope as 'project' | 'global' | undefined }
}

function mcpDisabledInput(value: unknown): {
  name: string
  disabled: boolean
  scope?: 'project' | 'global'
} {
  if (!value || typeof value !== 'object') throw new Error('Invalid MCP disabled request.')
  const input = value as Record<string, unknown>
  if (typeof input.disabled !== 'boolean') throw new Error('disabled must be a boolean.')
  if (input.scope !== undefined && input.scope !== 'project' && input.scope !== 'global')
    throw new Error('Invalid MCP scope.')
  return {
    name: mcpName(input.name),
    disabled: input.disabled,
    scope: input.scope as 'project' | 'global' | undefined
  }
}

async function validateWorkspace(path: string): Promise<string> {
  const resolved = resolve(path)
  const detail = await stat(resolved)
  if (!detail.isDirectory()) throw new Error('Workspace path must be a directory.')
  return resolved
}

export function registerRuntimeService(runtimeManager: DesktopRuntimeManager): () => void {
  const subscribers = new Set<WebContents>()
  let activeRuntime: LocalRuntimeInstance | undefined
  let unsubscribeRuntime = (): void => undefined

  const removeSubscriber = (owner: WebContents): void => {
    subscribers.delete(owner)
  }

  const subscribeOwner = (owner: WebContents): void => {
    if (subscribers.has(owner)) return
    subscribers.add(owner)
    owner.once('destroyed', () => removeSubscriber(owner))
  }

  const broadcast = (event: RuntimeSessionEvent): void => {
    for (const owner of subscribers) {
      if (owner.isDestroyed()) subscribers.delete(owner)
      else owner.send(RUNTIME_IPC.sessionEvent, event)
    }
  }

  const getRuntime = async (owner: WebContents): Promise<LocalRuntimeInstance> => {
    subscribeOwner(owner)
    const runtime = await runtimeManager.getRuntime()
    if (runtime !== activeRuntime) {
      unsubscribeRuntime()
      activeRuntime = runtime
      unsubscribeRuntime = runtime.sessions.subscribe(broadcast)
    }
    return runtime
  }

  ipcMain.handle(RUNTIME_IPC.workspaceGet, () => workspaceInfo(runtimeManager.getWorkspacePath()))

  /** 校验并切换 Runtime 工作区；成功后向所有订阅者广播 workspaceChanged。 */
  const switchWorkspace = async (selected: string): Promise<DesktopWorkspaceInfo> => {
    const path = await validateWorkspace(selected)
    unsubscribeRuntime()
    unsubscribeRuntime = (): void => undefined
    activeRuntime = undefined
    await runtimeManager.setWorkspacePath(path)
    const info = workspaceInfo(path)
    for (const subscriber of subscribers) {
      if (!subscriber.isDestroyed()) subscriber.send(RUNTIME_IPC.workspaceChanged, info)
    }
    return info
  }

  const pickDirectory = async (
    event: Electron.IpcMainInvokeEvent,
    title: string
  ): Promise<string | null> => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title,
      defaultPath: runtimeManager.getWorkspacePath(),
      properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    const selected = result.filePaths[0]
    if (result.canceled || !selected) return null
    return selected
  }

  ipcMain.handle(RUNTIME_IPC.workspaceSelect, async (event) => {
    const selected = await pickDirectory(event, '选择工作区')
    if (!selected) return null
    return switchWorkspace(selected)
  })

  ipcMain.handle(RUNTIME_IPC.projectList, async (event) => {
    const runtime = await getRuntime(event.sender)
    const activePath = runtimeManager.getWorkspacePath()
    return runtime.projects.list().then((projects) =>
      projects.map((project) => ({
        ...project,
        isActive: project.rootPath === activePath
      }))
    )
  })

  ipcMain.handle(RUNTIME_IPC.projectPickFolder, async (event) => {
    const selected = await pickDirectory(event, '选择项目文件夹')
    if (!selected) return null
    return validateWorkspace(selected)
  })

  ipcMain.handle(RUNTIME_IPC.projectCreate, async (event, input: unknown) => {
    const runtime = await getRuntime(event.sender)
    if (!input || typeof input !== 'object') throw new Error('Invalid project create request.')
    const request = input as Record<string, unknown>
    const rootPath = await validateWorkspace(requiredString(request.rootPath, 'rootPath', 1024))
    const project = await runtime.projects.create({
      rootPath,
      ...(request.name !== undefined ? { name: optionalString(request.name, 'name') } : {})
    })
    return { ...project, isActive: project.rootPath === runtimeManager.getWorkspacePath() }
  })

  ipcMain.handle(RUNTIME_IPC.projectOpen, async (event, input: unknown) => {
    const projectId = sessionId(input)
    const runtime = await getRuntime(event.sender)
    const project = (await runtime.projects.list()).find((candidate) => candidate.id === projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    await runtime.projects.touch(projectId)
    const workspace = await switchWorkspace(project.rootPath)
    return {
      project: { ...project, lastOpenedAt: new Date().toISOString(), isActive: true },
      workspace
    }
  })

  ipcMain.handle(RUNTIME_IPC.projectRename, async (event, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('Invalid project rename request.')
    const request = input as Record<string, unknown>
    const runtime = await getRuntime(event.sender)
    const project = await runtime.projects.rename(
      sessionId(request.projectId),
      requiredString(request.name, 'name', 200)
    )
    return { ...project, isActive: project.rootPath === runtimeManager.getWorkspacePath() }
  })

  ipcMain.handle(RUNTIME_IPC.projectRemove, async (event, input: unknown) => {
    const runtime = await getRuntime(event.sender)
    await runtime.projects.remove(sessionId(input))
  })

  const runtimeForSession = async (
    event: Electron.IpcMainInvokeEvent,
    input: unknown
  ): Promise<LocalRuntimeInstance> => {
    const id = sessionId(input)
    let runtime = await getRuntime(event.sender)
    const summary = (await runtime.sessions.listAll()).find((session) => session.id === id)
    if (!summary) throw new Error(`Runtime session not found: ${id}`)
    if (summary.projectPath && summary.projectPath !== runtimeManager.getWorkspacePath()) {
      await switchWorkspace(summary.projectPath)
      runtime = await getRuntime(event.sender)
    }
    return runtime
  }

  const runtimeForCreate = async (
    event: Electron.IpcMainInvokeEvent,
    input: CreateRuntimeSessionInput
  ): Promise<LocalRuntimeInstance> => {
    let runtime = await getRuntime(event.sender)
    if (input.projectId) {
      const project = (await runtime.projects.list()).find(
        (candidate) => candidate.id === input.projectId
      )
      if (!project) throw new Error(`Project not found: ${input.projectId}`)
      if (project.rootPath !== runtimeManager.getWorkspacePath()) {
        await switchWorkspace(project.rootPath)
        runtime = await getRuntime(event.sender)
      }
    }
    return runtime
  }

  ipcMain.handle(RUNTIME_IPC.sessionList, async (event) => {
    const runtime = await getRuntime(event.sender)
    return runtime.sessions.listAll()
  })
  ipcMain.handle(RUNTIME_IPC.modelList, async (event) => {
    const runtime = await getRuntime(event.sender)
    return runtime.models.listAvailable()
  })
  ipcMain.handle(RUNTIME_IPC.modeList, async (event) => {
    const runtime = await getRuntime(event.sender)
    return runtime.controller.listModes().map((mode) => ({
      id: mode.id,
      name: mode.name ?? mode.id,
      description: mode.description,
      defaultModelId: mode.defaultModelId,
      metadata: mode.metadata
    }))
  })
  ipcMain.handle(RUNTIME_IPC.expertList, async (event) => {
    const runtime = await getRuntime(event.sender)
    return runtime.experts.scan()
  })
  ipcMain.handle(RUNTIME_IPC.expertSave, async (event, input: unknown) => {
    const runtime = await getRuntime(event.sender)
    if (!input || typeof input !== 'object') throw new Error('Invalid expert save request.')
    const request = input as Record<string, unknown>
    return runtime.experts.save({
      name: requiredString(request.name, 'name', 100),
      description: requiredString(request.description, 'description', 500),
      instructions: requiredString(request.instructions, 'instructions', 20_000),
      ...(typeof request.slug === 'string' && request.slug.trim()
        ? { slug: request.slug.trim().toLowerCase() }
        : {}),
      ...(Array.isArray(request.tools) ? { tools: request.tools as string[] } : {}),
      ...(Array.isArray(request.skills) ? { skills: request.skills as string[] } : {}),
      ...(typeof request.model === 'string' && request.model.trim()
        ? { model: request.model.trim() }
        : {}),
      ...(Array.isArray(request.tags) ? { tags: request.tags as string[] } : {}),
      ...(typeof request.icon === 'string' && request.icon.trim()
        ? { icon: request.icon.trim() }
        : {}),
      ...(Array.isArray(request.suggestedPrompts)
        ? { suggestedPrompts: request.suggestedPrompts as string[] }
        : {})
    })
  })
  ipcMain.handle(RUNTIME_IPC.expertDelete, async (event, input: unknown) => {
    const runtime = await getRuntime(event.sender)
    return runtime.experts.delete(requiredString(input, 'slug', 128))
  })
  ipcMain.handle(RUNTIME_IPC.omGetStatus, async (event) => {
    const runtime = await getRuntime(event.sender)
    return runtime.om.getStatus()
  })
  ipcMain.handle(RUNTIME_IPC.omUpdate, async (event, input: unknown) => {
    const runtime = await getRuntime(event.sender)
    if (!input || typeof input !== 'object') throw new Error('Invalid OM update request.')
    const request = input as Record<string, unknown>
    const omUpdate: UpdateRuntimeOmInput = {}
    if (typeof request.observerModelId === 'string' && request.observerModelId.trim()) {
      omUpdate.observerModelId = request.observerModelId.trim()
    }
    if (typeof request.reflectorModelId === 'string' && request.reflectorModelId.trim()) {
      omUpdate.reflectorModelId = request.reflectorModelId.trim()
    }
    if (typeof request.observationThreshold === 'number') {
      omUpdate.observationThreshold = request.observationThreshold
    }
    if (typeof request.reflectionThreshold === 'number') {
      omUpdate.reflectionThreshold = request.reflectionThreshold
    }
    if (typeof request.cavemanObservations === 'boolean') {
      omUpdate.cavemanObservations = request.cavemanObservations
    }
    if (request.observeAttachments === 'auto' || typeof request.observeAttachments === 'boolean') {
      omUpdate.observeAttachments = request.observeAttachments
    }
    if (request.scope === 'thread' || request.scope === 'resource') {
      omUpdate.scope = request.scope
    }
    return runtime.om.update(omUpdate)
  })
  ipcMain.handle(RUNTIME_IPC.skillList, async (event, input: unknown) => {
    const runtime = await getRuntime(event.sender)
    return runtime.skills.list(skillListInput(input))
  })
  ipcMain.handle(RUNTIME_IPC.skillSearch, async (event, input: unknown) => {
    const runtime = await getRuntime(event.sender)
    return runtime.skills.search(skillSearchInput(input))
  })
  ipcMain.handle(RUNTIME_IPC.skillInvoke, async (event, input: unknown) => {
    const runtime = await getRuntime(event.sender)
    await runtime.skills.invoke(skillInvokeInput(input))
  })
  ipcMain.handle(RUNTIME_IPC.mcpList, async (event) => (await getRuntime(event.sender)).mcp.list())
  ipcMain.handle(RUNTIME_IPC.mcpConfigPaths, async (event) =>
    (await getRuntime(event.sender)).mcp.getConfigPaths()
  )
  ipcMain.handle(RUNTIME_IPC.mcpProjectConfig, async (event) =>
    (await getRuntime(event.sender)).mcp.getProjectConfig()
  )
  ipcMain.handle(RUNTIME_IPC.mcpReplaceProjectConfig, async (event, input: unknown) => {
    const runtime = await getRuntime(event.sender)
    return runtime.mcp.replaceProjectConfig(mcpProjectConfigInput(input))
  })
  ipcMain.handle(RUNTIME_IPC.mcpUpsert, async (event, input: unknown) => {
    const runtime = await getRuntime(event.sender)
    const request = mcpUpdateInput(input)
    return runtime.mcp.upsert(request.name, request.config)
  })
  ipcMain.handle(RUNTIME_IPC.mcpRemove, async (event, input: unknown) => {
    const runtime = await getRuntime(event.sender)
    await runtime.mcp.remove(mcpName(input))
  })
  ipcMain.handle(RUNTIME_IPC.mcpReload, async (event) =>
    (await getRuntime(event.sender)).mcp.reload()
  )
  ipcMain.handle(RUNTIME_IPC.mcpReconnect, async (event, input: unknown) =>
    (await getRuntime(event.sender)).mcp.reconnect(mcpName(input))
  )
  ipcMain.handle(RUNTIME_IPC.mcpSetDisabled, async (event, input: unknown) => {
    const runtime = await getRuntime(event.sender)
    const request = mcpDisabledInput(input)
    return runtime.mcp.setDisabled(request.name, request.disabled, request.scope)
  })
  ipcMain.handle(RUNTIME_IPC.mcpSetAllDisabled, async (event, input: unknown) => {
    const runtime = await getRuntime(event.sender)
    const request = mcpSetAllDisabledInput(input)
    await runtime.mcp.setAllDisabled(request.disabled, request.scope)
  })
  ipcMain.handle(RUNTIME_IPC.mcpAuthenticate, async (event, input: unknown) =>
    (await getRuntime(event.sender)).mcp.authenticate(mcpName(input), (url) => {
      void import('electron').then(({ shell }) => shell.openExternal(url))
    })
  )
  ipcMain.handle(RUNTIME_IPC.mcpCancelAuthentication, async (event, input: unknown) =>
    (await getRuntime(event.sender)).mcp.cancelAuthentication(mcpName(input))
  )
  ipcMain.handle(RUNTIME_IPC.mcpLogs, async (event, input: unknown) =>
    (await getRuntime(event.sender)).mcp.getLogs(mcpName(input))
  )
  ipcMain.handle(RUNTIME_IPC.sessionCreate, async (event, input: unknown) => {
    const request = createInput(input)
    const runtime = await runtimeForCreate(event, request)
    return runtime.sessions.create(request)
  })
  ipcMain.handle(RUNTIME_IPC.sessionGet, async (event, input: unknown) => {
    const runtime = await runtimeForSession(event, input)
    return runtime.sessions.get(sessionId(input))
  })
  ipcMain.handle(RUNTIME_IPC.sessionUpdate, async (event, input: unknown) => {
    const request = updateInput(input)
    const runtime = await runtimeForSession(event, request.sessionId)
    return runtime.sessions.update(request)
  })
  ipcMain.handle(RUNTIME_IPC.sessionDelete, async (event, input: unknown) => {
    const runtime = await runtimeForSession(event, input)
    await runtime.sessions.delete(sessionId(input))
  })
  ipcMain.handle(RUNTIME_IPC.sessionSendMessage, async (event, input: unknown) => {
    const request = sendInput(input)
    const runtime = await runtimeForSession(event, request.sessionId)
    await runtime.sessions.sendMessage(request)
  })
  ipcMain.handle(RUNTIME_IPC.sessionRespondAccess, async (event, input: unknown) => {
    const request = accessResponseInput(input)
    const runtime = await runtimeForSession(event, request.sessionId)
    await runtime.sessions.respondToAccessRequest(request)
  })
  ipcMain.handle(RUNTIME_IPC.sessionAbort, async (event, input: unknown) => {
    const runtime = await runtimeForSession(event, input)
    await runtime.sessions.abort(sessionId(input))
  })

  return () => {
    unsubscribeRuntime()
    subscribers.clear()
    for (const channel of [
      RUNTIME_IPC.workspaceGet,
      RUNTIME_IPC.workspaceSelect,
      RUNTIME_IPC.projectList,
      RUNTIME_IPC.projectPickFolder,
      RUNTIME_IPC.projectCreate,
      RUNTIME_IPC.projectOpen,
      RUNTIME_IPC.projectRename,
      RUNTIME_IPC.projectRemove,
      RUNTIME_IPC.modelList,
      RUNTIME_IPC.modeList,
      RUNTIME_IPC.expertList,
      RUNTIME_IPC.expertSave,
      RUNTIME_IPC.expertDelete,
      RUNTIME_IPC.skillList,
      RUNTIME_IPC.skillSearch,
      RUNTIME_IPC.skillInvoke,
      RUNTIME_IPC.mcpList,
      RUNTIME_IPC.mcpConfigPaths,
      RUNTIME_IPC.mcpProjectConfig,
      RUNTIME_IPC.mcpReplaceProjectConfig,
      RUNTIME_IPC.mcpUpsert,
      RUNTIME_IPC.mcpRemove,
      RUNTIME_IPC.mcpReload,
      RUNTIME_IPC.mcpReconnect,
      RUNTIME_IPC.mcpSetDisabled,
      RUNTIME_IPC.mcpSetAllDisabled,
      RUNTIME_IPC.mcpAuthenticate,
      RUNTIME_IPC.mcpCancelAuthentication,
      RUNTIME_IPC.mcpLogs,
      RUNTIME_IPC.sessionList,
      RUNTIME_IPC.sessionCreate,
      RUNTIME_IPC.sessionGet,
      RUNTIME_IPC.sessionUpdate,
      RUNTIME_IPC.sessionDelete,
      RUNTIME_IPC.sessionSendMessage,
      RUNTIME_IPC.sessionRespondAccess,
      RUNTIME_IPC.sessionAbort
    ]) {
      ipcMain.removeHandler(channel)
    }
  }
}
