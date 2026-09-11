import type {
  CreateRuntimeSessionInput,
  InvokeRuntimeSkillInput,
  ListRuntimeSkillsInput,
  RespondRuntimeAccessRequestInput,
  RuntimeExpertSaveInput,
  RuntimeExpertScanResult,
  RuntimeOmStatus,
  RuntimePentestCreationIntent,
  RuntimePentestDriverStatus,
  RuntimePentestEngagementSnapshot,
  RuntimePentestEvent,
  RuntimeSessionEvent,
  RuntimeModelInfo,
  RuntimeModeInfo,
  RuntimeSkillInfo,
  RuntimeSkillSearchResult,
  RuntimeSessionSnapshot,
  RuntimeSessionSummary,
  RuntimeMcpConfigPaths,
  RuntimeMcpServer,
  RuntimeMcpServerConfig,
  RuntimeMcpProjectConfig,
  SearchRuntimeSkillsInput,
  SendRuntimeSessionMessageInput,
  UpdateRuntimeOmInput,
  UpdateRuntimeSessionInput
} from '@mingyi/runtime'

export const RUNTIME_IPC = {
  workspaceGet: 'runtime:workspace:get',
  workspaceSelect: 'runtime:workspace:select',
  workspaceChanged: 'runtime:workspace:changed',
  modelList: 'runtime:model:list',
  modeList: 'runtime:mode:list',
  skillList: 'runtime:skill:list',
  skillSearch: 'runtime:skill:search',
  skillInvoke: 'runtime:skill:invoke',
  sessionList: 'runtime:session:list',
  sessionCreate: 'runtime:session:create',
  sessionGet: 'runtime:session:get',
  sessionUpdate: 'runtime:session:update',
  sessionDelete: 'runtime:session:delete',
  sessionSendMessage: 'runtime:session:send-message',
  sessionRespondAccess: 'runtime:session:respond-access',
  sessionAbort: 'runtime:session:abort',
  sessionEvent: 'runtime:session:event',
  mcpList: 'runtime:mcp:list',
  mcpConfigPaths: 'runtime:mcp:config-paths',
  mcpProjectConfig: 'runtime:mcp:project-config',
  mcpReplaceProjectConfig: 'runtime:mcp:replace-project-config',
  mcpUpsert: 'runtime:mcp:upsert',
  mcpRemove: 'runtime:mcp:remove',
  mcpReload: 'runtime:mcp:reload',
  mcpReconnect: 'runtime:mcp:reconnect',
  mcpSetDisabled: 'runtime:mcp:set-disabled',
  mcpSetAllDisabled: 'runtime:mcp:set-all-disabled',
  mcpAuthenticate: 'runtime:mcp:authenticate',
  mcpCancelAuthentication: 'runtime:mcp:cancel-authentication',
  mcpLogs: 'runtime:mcp:logs',
  pentestCreate: 'runtime:pentest:create',
  pentestGet: 'runtime:pentest:get',
  pentestList: 'runtime:pentest:list',
  pentestAddHint: 'runtime:pentest:add-hint',
  pentestStart: 'runtime:pentest:start',
  pentestPause: 'runtime:pentest:pause',
  pentestResume: 'runtime:pentest:resume',
  pentestStop: 'runtime:pentest:stop',
  pentestDriverStatus: 'runtime:pentest:driver-status',
  pentestParseIntent: 'runtime:pentest:parse-intent',
  pentestEvent: 'runtime:pentest:event',
  expertList: 'runtime:expert:list',
  expertSave: 'runtime:expert:save',
  expertDelete: 'runtime:expert:delete',
  omGetStatus: 'runtime:om:get-status',
  omUpdate: 'runtime:om:update',
  projectList: 'runtime:project:list',
  projectPickFolder: 'runtime:project:pick-folder',
  projectCreate: 'runtime:project:create',
  projectOpen: 'runtime:project:open',
  projectRename: 'runtime:project:rename',
  projectRemove: 'runtime:project:remove'
} as const

export interface DesktopWorkspaceInfo {
  path: string
  name: string
}

export interface DesktopProjectInfo {
  id: string
  name: string
  rootPath: string
  createdAt: string
  lastOpenedAt?: string
  /** rootPath 是否为当前 Runtime 工作区 */
  isActive: boolean
}

export interface DesktopProjectOpenResult {
  project: DesktopProjectInfo
  workspace: DesktopWorkspaceInfo
}

export interface RuntimeProjectBridge {
  list(): Promise<DesktopProjectInfo[]>
  /** 弹出系统文件夹选择对话框（可选新建目录）；取消返回 null。 */
  pickFolder(): Promise<string | null>
  create(input: { rootPath: string; name?: string }): Promise<DesktopProjectInfo>
  /** 切换 Runtime 工作区到项目根目录；工作区变更经 onChanged 广播。 */
  open(projectId: string): Promise<DesktopProjectOpenResult>
  rename(projectId: string, name: string): Promise<DesktopProjectInfo>
  remove(projectId: string): Promise<void>
}

export interface RuntimeWorkspaceBridge {
  get(): Promise<DesktopWorkspaceInfo>
  select(): Promise<DesktopWorkspaceInfo | null>
  onChanged(listener: (workspace: DesktopWorkspaceInfo) => void): () => void
}

export interface RuntimeSessionBridge {
  list(): Promise<RuntimeSessionSummary[]>
  create(input?: CreateRuntimeSessionInput): Promise<RuntimeSessionSnapshot>
  get(sessionId: string): Promise<RuntimeSessionSnapshot>
  update(input: UpdateRuntimeSessionInput): Promise<RuntimeSessionSnapshot>
  delete(sessionId: string): Promise<void>
  sendMessage(input: SendRuntimeSessionMessageInput): Promise<void>
  respondToAccessRequest(input: RespondRuntimeAccessRequestInput): Promise<void>
  abort(sessionId: string): Promise<void>
  onEvent(listener: (event: RuntimeSessionEvent) => void): () => void
}

export interface RuntimeModelBridge {
  list(): Promise<RuntimeModelInfo[]>
}

export interface RuntimeSkillBridge {
  list(input: ListRuntimeSkillsInput): Promise<RuntimeSkillInfo[]>
  search(input: SearchRuntimeSkillsInput): Promise<RuntimeSkillSearchResult[]>
  invoke(input: InvokeRuntimeSkillInput): Promise<void>
}

export interface RuntimeMcpBridge {
  list(): Promise<RuntimeMcpServer[]>
  getConfigPaths(): Promise<RuntimeMcpConfigPaths>
  getProjectConfig(): Promise<RuntimeMcpProjectConfig>
  replaceProjectConfig(config: RuntimeMcpProjectConfig): Promise<RuntimeMcpServer[]>
  upsert(name: string, config: RuntimeMcpServerConfig): Promise<RuntimeMcpServer>
  remove(name: string): Promise<void>
  reload(): Promise<RuntimeMcpServer[]>
  reconnect(name: string): Promise<RuntimeMcpServer>
  setDisabled(
    name: string,
    disabled: boolean,
    scope?: 'project' | 'global'
  ): Promise<RuntimeMcpServer>
  setAllDisabled(disabled: boolean, scope?: 'project' | 'global'): Promise<void>
  authenticate(name: string): Promise<RuntimeMcpServer>
  cancelAuthentication(name: string): Promise<boolean>
  logs(name: string): Promise<string[]>
}

export type DesktopPentestExecutionMode = 'read-only' | 'authorized-active'

export interface DesktopPentestCreateInput {
  title: string
  origin: string
  goal: string
  scope: string[]
  principal: string
  authorizationRef: string
  executionMode?: DesktopPentestExecutionMode
  expiresAt?: number
}

export interface DesktopPentestStartInput {
  engagementId: string
  worker?: string
  maxRounds?: number
}

export interface DesktopPentestResumeInput {
  engagementId: string
  approval?: 'approved' | 'denied'
}

export interface DesktopPentestEvent {
  engagementId: string
  event?: RuntimePentestEvent
  driver?: RuntimePentestDriverStatus
}

export interface RuntimePentestBridge {
  create(input: DesktopPentestCreateInput): Promise<RuntimePentestEngagementSnapshot>
  get(engagementId: string): Promise<RuntimePentestEngagementSnapshot>
  list(): Promise<string[]>
  addHint(engagementId: string, content: string): Promise<void>
  /** 启动驱动循环，立即返回；进度通过 onEvent 与 driverStatus 观察。 */
  start(input: DesktopPentestStartInput): Promise<void>
  pause(engagementId: string): Promise<void>
  /** 审批挂起时必须提供 approval 决定。 */
  resume(input: DesktopPentestResumeInput): Promise<void>
  stop(engagementId: string): Promise<void>
  driverStatus(engagementId: string): Promise<RuntimePentestDriverStatus | null>
  /** 解析一条聊天消息是否要创建 engagement 及抽取的草稿字段；可传入已有草稿做补全。 */
  parseIntent(
    message: string,
    existingDraft?: RuntimePentestCreationIntent
  ): Promise<RuntimePentestCreationIntent>
  onEvent(listener: (event: DesktopPentestEvent) => void): () => void
}

export type { RuntimeModeInfo }

export interface RuntimeModeBridge {
  list(): Promise<RuntimeModeInfo[]>
}

export interface RuntimeExpertBridge {
  /** 扫描 `<workspace>/<configDir>/agents/*.md`；warnings 为被跳过文件的原因。 */
  list(): Promise<RuntimeExpertScanResult>
  /** 写入/覆盖一个专家文件；mode 注册需工作区重连后生效（requiresRestart）。 */
  save(
    input: RuntimeExpertSaveInput
  ): Promise<{ path: string; slug: string; requiresRestart: boolean }>
  /** 删除专家文件（接受 `expert:<slug>` 或裸 slug）。 */
  delete(slug: string): Promise<{ removed: boolean; requiresRestart: boolean }>
}

export interface RuntimeOmBridge {
  /** 读取 Observational Memory 当前配置。 */
  getStatus(): Promise<RuntimeOmStatus>
  /** 更新 Observational Memory 配置；未指定字段保持不变。 */
  update(input: UpdateRuntimeOmInput): Promise<RuntimeOmStatus>
}
