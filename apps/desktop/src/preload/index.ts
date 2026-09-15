import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  PROVIDER_IPC,
  type FetchCustomModelsInput,
  type ProviderOAuthEvent,
  type ProviderOAuthLoginInput,
  type ProviderOAuthPromptResponse,
  type TestCustomModelInput
} from '../shared/provider-ipc'
import { FILE_IPC } from '../shared/file-ipc'
import {
  RUNTIME_IPC,
  type DesktopPentestCreateInput,
  type DesktopPentestEvent,
  type DesktopPentestResumeInput,
  type DesktopPentestStartInput,
  type DesktopWorkspaceInfo
} from '../shared/runtime-ipc'
import type {
  CreateRuntimeSessionInput,
  InvokeRuntimeSkillInput,
  ListRuntimeSkillsInput,
  RespondRuntimeAccessRequestInput,
  RuntimeExpertSaveInput,
  RuntimePentestCreationIntent,
  RuntimeSessionEvent,
  SearchRuntimeSkillsInput,
  SendRuntimeSessionMessageInput,
  UpdateRuntimeOmInput,
  UpdateRuntimeSessionInput,
  UpsertRuntimeCustomProviderInput
} from '@mingyi/runtime'

// Custom APIs for renderer
const api = {
  /**
   * 窗口外壳的平台标识（只读）。
   * 仅用于顶栏留白、系统窗口按钮让位这类外壳差异；业务逻辑不要依赖它，
   * 需要跨平台行为差异时优先在主进程收敛（例如 BrowserWindow 的按平台展开）。
   */
  platform: process.platform,
  createTerminal: (
    id: string,
    options?: { cols?: number; rows?: number; cwd?: string; shell?: string }
  ): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('terminal:create', id, options),
  sendTerminalInput: (id: string, data: string) => ipcRenderer.send('terminal:input', id, data),
  resizeTerminal: (id: string, cols: number, rows: number) =>
    ipcRenderer.send('terminal:resize', id, cols, rows),
  disposeTerminal: (id: string) => ipcRenderer.send('terminal:dispose', id),
  onTerminalData: (listener: (id: string, data: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string, data: string): void =>
      listener(id, data)
    ipcRenderer.on('terminal:data', handler)
    return () => ipcRenderer.removeListener('terminal:data', handler)
  },
  onTerminalExit: (
    listener: (id: string, detail: { exitCode: number; signal?: number }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      id: string,
      detail: { exitCode: number; signal?: number }
    ): void => listener(id, detail)
    ipcRenderer.on('terminal:exit', handler)
    return () => ipcRenderer.removeListener('terminal:exit', handler)
  },
  providers: {
    list: () => ipcRenderer.invoke(PROVIDER_IPC.list),
    setApiKey: (input: { provider: string; key: string }) =>
      ipcRenderer.invoke(PROVIDER_IPC.setApiKey, input),
    removeApiKey: (provider: string) => ipcRenderer.invoke(PROVIDER_IPC.removeApiKey, provider),
    listCustom: () => ipcRenderer.invoke(PROVIDER_IPC.listCustom),
    upsertCustom: (input: UpsertRuntimeCustomProviderInput) =>
      ipcRenderer.invoke(PROVIDER_IPC.upsertCustom, input),
    removeCustom: (providerId: string) => ipcRenderer.invoke(PROVIDER_IPC.removeCustom, providerId),
    fetchCustomModels: (input: FetchCustomModelsInput) =>
      ipcRenderer.invoke(PROVIDER_IPC.fetchCustomModels, input),
    testCustomModel: (input: TestCustomModelInput) =>
      ipcRenderer.invoke(PROVIDER_IPC.testCustomModel, input),
    onChanged: (listener: () => void): (() => void) => {
      const handler = (): void => listener()
      ipcRenderer.on(PROVIDER_IPC.changed, handler)
      return () => ipcRenderer.removeListener(PROVIDER_IPC.changed, handler)
    },
    listOAuth: () => ipcRenderer.invoke(PROVIDER_IPC.listOAuth),
    loginOAuth: (input: ProviderOAuthLoginInput) =>
      ipcRenderer.invoke(PROVIDER_IPC.loginOAuth, input),
    logoutOAuth: (provider: string) => ipcRenderer.invoke(PROVIDER_IPC.logoutOAuth, provider),
    cancelOAuth: (provider: string) => ipcRenderer.invoke(PROVIDER_IPC.cancelOAuth, provider),
    respondOAuthPrompt: (input: ProviderOAuthPromptResponse) =>
      ipcRenderer.invoke(PROVIDER_IPC.respondOAuthPrompt, input),
    onOAuthEvent: (listener: (event: ProviderOAuthEvent) => void): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        providerEvent: ProviderOAuthEvent
      ): void => listener(providerEvent)
      ipcRenderer.on(PROVIDER_IPC.oauthEvent, handler)
      return () => ipcRenderer.removeListener(PROVIDER_IPC.oauthEvent, handler)
    }
  },
  workspace: {
    get: () => ipcRenderer.invoke(RUNTIME_IPC.workspaceGet),
    select: () => ipcRenderer.invoke(RUNTIME_IPC.workspaceSelect),
    onChanged: (listener: (workspace: DesktopWorkspaceInfo) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, workspace: DesktopWorkspaceInfo): void =>
        listener(workspace)
      ipcRenderer.on(RUNTIME_IPC.workspaceChanged, handler)
      return () => ipcRenderer.removeListener(RUNTIME_IPC.workspaceChanged, handler)
    }
  },
  projects: {
    list: () => ipcRenderer.invoke(RUNTIME_IPC.projectList),
    pickFolder: () => ipcRenderer.invoke(RUNTIME_IPC.projectPickFolder),
    create: (input: { rootPath: string; name?: string }) =>
      ipcRenderer.invoke(RUNTIME_IPC.projectCreate, input),
    open: (projectId: string) => ipcRenderer.invoke(RUNTIME_IPC.projectOpen, projectId),
    rename: (projectId: string, name: string) =>
      ipcRenderer.invoke(RUNTIME_IPC.projectRename, { projectId, name }),
    remove: (projectId: string) => ipcRenderer.invoke(RUNTIME_IPC.projectRemove, projectId)
  },
  files: {
    readDirectory: (dirPath?: string) => ipcRenderer.invoke(FILE_IPC.readDirectory, dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke(FILE_IPC.readFile, filePath),
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke(FILE_IPC.writeFile, filePath, content)
  },
  models: {
    list: () => ipcRenderer.invoke(RUNTIME_IPC.modelList)
  },
  modes: {
    list: () => ipcRenderer.invoke(RUNTIME_IPC.modeList)
  },
  experts: {
    list: () => ipcRenderer.invoke(RUNTIME_IPC.expertList),
    save: (input: RuntimeExpertSaveInput) => ipcRenderer.invoke(RUNTIME_IPC.expertSave, input),
    delete: (slug: string) => ipcRenderer.invoke(RUNTIME_IPC.expertDelete, slug)
  },
  om: {
    getStatus: () => ipcRenderer.invoke(RUNTIME_IPC.omGetStatus),
    update: (input: UpdateRuntimeOmInput) => ipcRenderer.invoke(RUNTIME_IPC.omUpdate, input)
  },
  skills: {
    list: (input: ListRuntimeSkillsInput) => ipcRenderer.invoke(RUNTIME_IPC.skillList, input),
    search: (input: SearchRuntimeSkillsInput) => ipcRenderer.invoke(RUNTIME_IPC.skillSearch, input),
    invoke: (input: InvokeRuntimeSkillInput) => ipcRenderer.invoke(RUNTIME_IPC.skillInvoke, input)
  },
  mcp: {
    list: () => ipcRenderer.invoke(RUNTIME_IPC.mcpList),
    getConfigPaths: () => ipcRenderer.invoke(RUNTIME_IPC.mcpConfigPaths),
    getProjectConfig: () => ipcRenderer.invoke(RUNTIME_IPC.mcpProjectConfig),
    replaceProjectConfig: (config: unknown) =>
      ipcRenderer.invoke(RUNTIME_IPC.mcpReplaceProjectConfig, config),
    upsert: (name: string, config: unknown) =>
      ipcRenderer.invoke(RUNTIME_IPC.mcpUpsert, { name, config }),
    remove: (name: string) => ipcRenderer.invoke(RUNTIME_IPC.mcpRemove, name),
    reload: () => ipcRenderer.invoke(RUNTIME_IPC.mcpReload),
    reconnect: (name: string) => ipcRenderer.invoke(RUNTIME_IPC.mcpReconnect, name),
    setDisabled: (name: string, disabled: boolean, scope?: 'project' | 'global') =>
      ipcRenderer.invoke(RUNTIME_IPC.mcpSetDisabled, { name, disabled, scope }),
    setAllDisabled: (disabled: boolean, scope?: 'project' | 'global') =>
      ipcRenderer.invoke(RUNTIME_IPC.mcpSetAllDisabled, { disabled, scope }),
    authenticate: (name: string) => ipcRenderer.invoke(RUNTIME_IPC.mcpAuthenticate, name),
    cancelAuthentication: (name: string) =>
      ipcRenderer.invoke(RUNTIME_IPC.mcpCancelAuthentication, name),
    logs: (name: string) => ipcRenderer.invoke(RUNTIME_IPC.mcpLogs, name)
  },
  sessions: {
    list: () => ipcRenderer.invoke(RUNTIME_IPC.sessionList),
    create: (input?: CreateRuntimeSessionInput) =>
      ipcRenderer.invoke(RUNTIME_IPC.sessionCreate, input),
    get: (sessionId: string) => ipcRenderer.invoke(RUNTIME_IPC.sessionGet, sessionId),
    update: (input: UpdateRuntimeSessionInput) =>
      ipcRenderer.invoke(RUNTIME_IPC.sessionUpdate, input),
    delete: (sessionId: string) => ipcRenderer.invoke(RUNTIME_IPC.sessionDelete, sessionId),
    sendMessage: (input: SendRuntimeSessionMessageInput) =>
      ipcRenderer.invoke(RUNTIME_IPC.sessionSendMessage, input),
    respondToAccessRequest: (input: RespondRuntimeAccessRequestInput) =>
      ipcRenderer.invoke(RUNTIME_IPC.sessionRespondAccess, input),
    abort: (sessionId: string) => ipcRenderer.invoke(RUNTIME_IPC.sessionAbort, sessionId),
    onEvent: (listener: (event: RuntimeSessionEvent) => void): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        sessionEvent: RuntimeSessionEvent
      ): void => listener(sessionEvent)
      ipcRenderer.on(RUNTIME_IPC.sessionEvent, handler)
      return () => ipcRenderer.removeListener(RUNTIME_IPC.sessionEvent, handler)
    }
  },
  pentest: {
    create: (input: DesktopPentestCreateInput) =>
      ipcRenderer.invoke(RUNTIME_IPC.pentestCreate, input),
    get: (engagementId: string) => ipcRenderer.invoke(RUNTIME_IPC.pentestGet, engagementId),
    list: () => ipcRenderer.invoke(RUNTIME_IPC.pentestList),
    addHint: (engagementId: string, content: string) =>
      ipcRenderer.invoke(RUNTIME_IPC.pentestAddHint, { engagementId, content }),
    start: (input: DesktopPentestStartInput) => ipcRenderer.invoke(RUNTIME_IPC.pentestStart, input),
    pause: (engagementId: string) => ipcRenderer.invoke(RUNTIME_IPC.pentestPause, engagementId),
    resume: (input: DesktopPentestResumeInput) =>
      ipcRenderer.invoke(RUNTIME_IPC.pentestResume, input),
    stop: (engagementId: string) => ipcRenderer.invoke(RUNTIME_IPC.pentestStop, engagementId),
    driverStatus: (engagementId: string) =>
      ipcRenderer.invoke(RUNTIME_IPC.pentestDriverStatus, engagementId),
    parseIntent: (message: string, existingDraft?: RuntimePentestCreationIntent) =>
      ipcRenderer.invoke(RUNTIME_IPC.pentestParseIntent, { message, existingDraft }),
    onEvent: (listener: (event: DesktopPentestEvent) => void): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        pentestEvent: DesktopPentestEvent
      ): void => listener(pentestEvent)
      ipcRenderer.on(RUNTIME_IPC.pentestEvent, handler)
      return () => ipcRenderer.removeListener(RUNTIME_IPC.pentestEvent, handler)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
