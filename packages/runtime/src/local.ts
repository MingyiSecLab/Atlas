import { bootLocalAgentController, wireSessionConcerns } from '@mastra/code-sdk'
import { loadSettings } from '@mastra/code-sdk/onboarding/settings'
import type { MastraCodeState } from '@mastra/code-sdk/schema'
import { join, resolve } from 'node:path'
import { resolvePaths } from './paths.js'
import { createControllerConfig } from './mastra/controller.js'
import { createRuntimeModelService, initializeRuntimeModelService } from './models/service.js'
import { createRuntimeProviderService } from './providers/service.js'
import { createRuntimeSessionService } from './sessions/service.js'
import { createRuntimeSkillService } from './skills/service.js'
import { createRuntimeAutomationService } from './automations/service.js'
import { createRuntimeMcpService } from './mcp/service.js'
import { createRuntimeStateSearchService } from './state-search/service.js'
import { createRuntimeOmService } from './om/service.js'
import {
  createFilePentestEvidenceStore,
  createFilePentestStore
} from './pentest/store.js'
import { createFileProjectStore, createMemoryProjectStore } from './projects/store.js'
import { createRuntimePentestService } from './pentest/service.js'
import { createRuntimeProjectService } from './projects/service.js'
import { createRuntimeExpertService } from './experts/service.js'
import { createDockerSandboxAdapter } from './sandbox/docker.js'
import type { LocalRuntimeConfig, LocalRuntimeInstance } from './types.js'

/**
 * 创建本地模式 Runtime
 *
 * 使用 bootLocalAgentController() 直接创建 AgentController，
 * 无需 HTTP Server。适用于 Desktop（通过 IPC）和 TUI（直接调用）。
 *
 * @example
 * ```typescript
 * // Desktop Main Process
 * const runtime = await createLocalRuntime({
 *   workspacePath: '/path/to/project',
 *   modes: [{ id: 'architect', name: 'Architect', ... }],
 * });
 *
 * // 注册 IPC Handlers
 * ipcMain.handle('agent:sendMessage', async (_, msg) => {
 *   return await runtime.session.sendMessage(msg);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // TUI
 * const runtime = await createLocalRuntime({
 *   workspacePath: process.cwd(),
 * });
 *
 * // 直接使用
 * await runtime.session.sendMessage({
 *   content: 'Implement login'
 * });
 * ```
 */
export async function createLocalRuntime(
  config: LocalRuntimeConfig
): Promise<LocalRuntimeInstance> {
  // 1. 解析路径
  const paths = resolvePaths({
    workspacePath: config.workspacePath,
    homeDir: config.homeDir
  })

  const stateSearch = createRuntimeStateSearchService()
  // pentestDataDir 提供时启用 engagement 快照与证据内容的跨重启持久化。
  // blobsDir 提供时原始证据分流到 <blobsDir>/evidence/（终端大日志、抓包等大文件统一走 blobs）。
  const pentestDataDir = config.pentestDataDir
    ? resolve(config.pentestDataDir)
    : undefined
  const blobsDir = config.blobsDir ? resolve(config.blobsDir) : undefined
  const evidenceDir = blobsDir ? join(blobsDir, 'evidence') : pentestDataDir
  const pentest = createRuntimePentestService({
    stateSearch,
    ...(pentestDataDir
      ? { store: createFilePentestStore({ directory: pentestDataDir }) }
      : {}),
    ...(evidenceDir
      ? { evidenceStore: createFilePentestEvidenceStore({ directory: evidenceDir }) }
      : {})
  })

  // 1.5 Kali 沙箱执行器（可选）：提供 config.sandbox 时创建，容器按需拉起（ensure 惰性）。
  const sandbox = config.sandbox
    ? createDockerSandboxAdapter({ ...config.sandbox })
    : undefined

  // 2. 创建 Controller 配置
  const controllerConfig = createControllerConfig({
    workspacePath: paths.workspacePath,
    homeDir: paths.homeDir,
    configDir: config.configDir,
    settingsPath: config.settingsPath,
    modes: config.modes,
    subagents: config.subagents,
    models: config.models,
    extraTools: config.extraTools,
    disabledTools: config.disabledTools,
    ...(config.vector ? { vector: config.vector } : {}),
    ...(config.userAgentsDir ? { userAgentsDir: config.userAgentsDir } : {}),
    observationalMemory: config.observationalMemory,
    pentestService: pentest,
    ...(sandbox ? { sandbox } : {})
  })

  // 3. 调用官方 API 创建 Controller 和 Session
  const boot = await bootLocalAgentController(controllerConfig)
  const { controller, session, authStorage, stopPluginSignalProviders, mcpManager } = boot

  const models = createRuntimeModelService({
    controller,
    session,
    settingsPath: controllerConfig.settingsPath
  })
  const providers = createRuntimeProviderService({
    controller,
    authStorage,
    settingsPath: controllerConfig.settingsPath
  })
  const sessions = createRuntimeSessionService({
    controller,
    defaultSession: session,
    workspacePath: paths.workspacePath,
    wireSession: (targetSession) => wireSessionConcerns(boot, targetSession),
    activateSession: boot.setActiveSession
  })
  const skills = createRuntimeSkillService({
    resolveSession: sessions.resolveSession,
    resolveDefaultSession: async () => session,
    activateSession: boot.setActiveSession
  })
  const automations = createRuntimeAutomationService({
    mastra: controller.getMastra(),
    resourceId: session.identity.getResourceId()
  })
  const mcp = createRuntimeMcpService({
    manager: mcpManager,
    projectPath: paths.workspacePath,
    configDir: controllerConfig.configDir
  })
  // OM 旋钮需广播到全部会话（各 Session state 隔离）并持久化到 settings.json，
  // 重启后由 SDK 播种进新会话的 initialState。
  const om = createRuntimeOmService({
    controller,
    defaultSession: session,
    broadcastState: sessions.applyOmState,
    ...(controllerConfig.settingsPath
      ? { settingsPath: controllerConfig.settingsPath }
      : {})
  })
  // 若 settings.json 中有持久化的 OM 覆盖配置，在会话服务挂载时预热 omOverrides，
  // 确保所有会话（含刚创建或恢复的 Session）立即生效，避免回退到默认未授权的 Gemini。
  if (controllerConfig.settingsPath) {
    try {
      const persisted = loadSettings(controllerConfig.settingsPath)
      const initialOm: Partial<MastraCodeState> = {}
      if (persisted.models?.observerModelOverride) {
        initialOm.observerModelId = persisted.models.observerModelOverride
      }
      if (persisted.models?.reflectorModelOverride) {
        initialOm.reflectorModelId = persisted.models.reflectorModelOverride
      }
      if (persisted.models?.omObservationThreshold) {
        initialOm.observationThreshold = persisted.models.omObservationThreshold
      }
      if (persisted.models?.omReflectionThreshold) {
        initialOm.reflectionThreshold = persisted.models.omReflectionThreshold
      }
      if (persisted.models?.omCavemanObservations !== null && persisted.models?.omCavemanObservations !== undefined) {
        initialOm.cavemanObservations = persisted.models.omCavemanObservations
      }
      if (persisted.models?.omObserveAttachments !== null && persisted.models?.omObserveAttachments !== undefined) {
        initialOm.observeAttachments = persisted.models.omObserveAttachments
      }
      if (Object.keys(initialOm).length > 0) {
        void sessions.applyOmState(initialOm)
      }
    } catch {}
  }
  // 工作区专家文件服务（<configDir>/agents/*.md 的扫描与写回；userAgentsDir 提供时
  // 同时合并用户级目录）；mode 注册发生在 Controller 构造时（createControllerConfig
  // 内扫描），save 后需重连工作区生效。
  const experts = createRuntimeExpertService({
    workspacePath: paths.workspacePath,
    configDirName: controllerConfig.configDir,
    ...(config.userAgentsDir ? { userDirectory: config.userAgentsDir } : {})
  })
  // projectsDataDir 提供时启用项目空间登记的跨重启持久化（<dir>/projects.json）。
  const projects = createRuntimeProjectService({
    ...(config.projectsDataDir
      ? { store: createFileProjectStore({ directory: resolve(config.projectsDataDir) }) }
      : { store: createMemoryProjectStore() })
  })
  void mcpManager?.initInBackground().catch(() => undefined)
  await initializeRuntimeModelService(models, config.models, session.mode.get())

  let shutdownStarted = false

  // 4. 返回 Runtime 实例
  return {
    controller,
    session,
    models,
    providers,
    sessions,
    skills,
    automations,
    mcp,
    stateSearch,
    om,
    pentest,
    experts,
    projects,
    // 沙箱容器保持常驻（README 语义：现场与证据保留，ensure 幂等复用）；
    // 需要显式停止时由宿主调用 sandbox.dispose()。
    ...(sandbox ? { sandbox } : {}),
    shutdown: async () => {
      if (shutdownStarted) return
      shutdownStarted = true
      await sessions.shutdown()
      session.abort()
      stopPluginSignalProviders()
      await mcpManager?.disconnect()
      await controller.destroy()
    }
  }
}
