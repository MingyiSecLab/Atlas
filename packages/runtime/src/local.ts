import { bootLocalAgentController, wireSessionConcerns } from '@mastra/code-sdk'
import { resolve } from 'node:path'
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
  const pentestDataDir = config.pentestDataDir
    ? resolve(config.pentestDataDir)
    : undefined
  const pentest = createRuntimePentestService({
    stateSearch,
    ...(pentestDataDir
      ? {
          store: createFilePentestStore({ directory: pentestDataDir }),
          evidenceStore: createFilePentestEvidenceStore({ directory: pentestDataDir })
        }
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
  const om = createRuntimeOmService({ controller, defaultSession: session })
  // 工作区专家文件服务（<configDir>/agents/*.md 的扫描与写回）；mode 注册发生在
  // Controller 构造时（createControllerConfig 内扫描），save 后需重连工作区生效。
  const experts = createRuntimeExpertService({
    workspacePath: paths.workspacePath,
    configDirName: controllerConfig.configDir
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
