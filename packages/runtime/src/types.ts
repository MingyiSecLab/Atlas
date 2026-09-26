import type {
  AgentController,
  AgentControllerMode,
  AgentControllerSubagent,
  Session
} from '@mastra/core/agent-controller'
import type { MastraCodeConfig } from '@mastra/code-sdk'
import type { RuntimeModelConfig, RuntimeModelService } from './models/types.js'
import type { RuntimeProviderService } from './providers/types.js'
import type { RuntimeSessionService } from './sessions/types.js'
import type { RuntimeSkillService } from './skills/types.js'
import type { RuntimeAutomationService } from './automations/types.js'
import type { RuntimeMcpService } from './mcp/types.js'
import type { RuntimeStateSearchService } from './state-search/types.js'
import type { RuntimeOmService } from './om/service.js'
import type { RuntimePentestService } from './pentest/types.js'
import type { RuntimeAuditService } from './audit/types.js'
import type { RuntimeProjectService } from './projects/types.js'
import type { DockerSandboxConfig, RuntimeSandboxAdapter } from './sandbox/types.js'
import type { RuntimeExpertService } from './experts/service.js'
import type { RuntimeObservationalMemoryConfig } from './mastra/observational-memory.js'

/**
 * 本地模式运行时配置
 */
export interface LocalRuntimeConfig {
  /** Workspace 根目录路径 */
  workspacePath: string

  /** 全局配置的 Home 根目录，默认 os.homedir() */
  homeDir?: string

  /** 配置目录名称，默认 .mastracode；必须是单个目录名而不是路径 */
  configDir?: string

  /** Code SDK settings.json 路径；默认使用 Mastra 全局设置路径。 */
  settingsPath?: string

  /** 自定义 modes（覆盖或扩展默认的 build/plan/fast） */
  modes?: AgentControllerMode[]

  /** 自定义 subagents（覆盖或扩展默认的 explore/plan/execute） */
  subagents?: AgentControllerSubagent[]

  /** Agent、Mode 和 Subagent 共用的模型配置。 */
  models?: RuntimeModelConfig

  /** 额外工具 */
  extraTools?: MastraCodeConfig['extraTools']

  /** 禁用的工具列表 */
  disabledTools?: string[]

  /** 自定义向量库实例；提供后 code-sdk 跳过默认 mastra-vectors.db 的创建 */
  vector?: MastraCodeConfig['vector']

  /** 用户级专家目录（如 ~/.atlas/agents）；与工作区 <configDir>/agents/ 合并扫描，工作区同名优先 */
  userAgentsDir?: string

  /** 大文件分流目录（blobs）；提供后 pentest 原始证据写入 <dir>/evidence/ 而非 pentest 数据目录 */
  blobsDir?: string

  /**
   * Pentest 持久化目录；提供后 engagement 快照与证据内容跨进程重启保留
   * （`<dir>/engagements/*.json` 与受限证据文件）。
   */
  pentestDataDir?: string

  /**
   * 项目空间登记持久化目录；提供后项目登记跨进程重启保留
   * （`<dir>/projects.json`）。
   */
  projectsDataDir?: string

  /**
   * 代码审计 run 持久化目录；提供后审计 run（覆盖台账 + 发现）跨进程重启保留
   * （`<dir>/<runId>.json`）。
   */
  auditDataDir?: string

  /**
   * Kali 沙箱配置；提供后创建 Docker 沙箱执行器并注册 kali_* 工具
   * （kali_exec / kali_session_* / kali_file_*）。缺省不启用沙箱能力。
   */
  sandbox?: DockerSandboxConfig

  /** Observational Memory 配置；省略时沿用 Mastra Code SDK 默认行为 */
  observationalMemory?: RuntimeObservationalMemoryConfig

  /** 日志级别 */
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
}

/**
 * 本地模式运行时实例
 */
export interface LocalRuntimeInstance {
  /** AgentController 实例 */
  controller: AgentController

  /** 默认 Session */
  session: Session

  /** 统一的模型查询和切换接口 */
  models: RuntimeModelService

  /** Provider 凭据状态、API Key 和 OAuth 管理接口 */
  providers: RuntimeProviderService

  /** 基于 AgentController Session 的会话、消息和事件接口 */
  sessions: RuntimeSessionService

  /** 基于 Workspace Skills 的发现、搜索和显式调用接口 */
  skills: RuntimeSkillService

  /** 基于 Mastra Schedules 的持久化自动化服务 */
  automations: RuntimeAutomationService

  /** 基于 Mastra Code SDK MCP Manager 的外部工具服务 */
  mcp: RuntimeMcpService

  /** 基于黑板的有界状态空间搜索服务（仅保存证据和协调状态） */
  stateSearch: RuntimeStateSearchService

  /** Observational Memory 配置读写服务（Controller state 旋钮） */
  om: RuntimeOmService

  /** Authorized penetration-testing engagement and evidence service. */
  pentest: RuntimePentestService

  /** 代码审计 run 服务（覆盖台账 + 结构化发现，audit mode 父编排器写入）。 */
  audit: RuntimeAuditService

  /** Workspace expert files (`<configDir>/agents/*.md`) scan and save service. */
  experts: RuntimeExpertService

  /** 项目空间登记服务（命名目录 → 会话 workspacePath 的映射）。 */
  projects: RuntimeProjectService

  /**
   * Kali 沙箱执行器；仅在 config.sandbox 提供时存在。
   * 生命周期说明：runtime.shutdown() 不停止容器（README 常驻语义，
   * 工作区现场保留），需要显式停止时调用 sandbox.dispose()。
   */
  sandbox?: RuntimeSandboxAdapter

  /** 关闭运行时 */
  shutdown: () => Promise<void>
}

// ==================== 以下为 HTTP Server 模式（未来扩展用） ====================

/**
 * Server 模式运行时配置（未来使用）
 */
export interface ServerRuntimeConfig extends LocalRuntimeConfig {
  host?: string
  port?: number
  bearerToken?: string
  corsOrigins?: string[]
}

/**
 * Server 连接信息（未来使用）
 */
export interface RuntimeConnectionInfo {
  url: string
  bearerToken: string
}

/**
 * Server 模式运行时实例（未来使用）
 */
export interface ServerRuntimeInstance {
  connectionInfo: RuntimeConnectionInfo
  shutdown: () => Promise<void>
}
