/**
 * Mingyi Runtime - 本地模式
 *
 * 为 Desktop 和 TUI 提供统一的 AgentController 创建和管理接口。
 * 使用 @mastra/code-sdk 的 bootLocalAgentController() 实现。
 *
 * @example
 * ```typescript
 * import { createLocalRuntime } from '@mingyi/runtime';
 *
 * const runtime = await createLocalRuntime({
 *   workspacePath: '/path/to/project',
 *   modes: [
 *     { id: 'architect', name: 'Architect', description: '架构设计模式' }
 *   ],
 *   subagents: [
 *     { id: 'security', name: 'Security', description: '安全审计' }
 *   ],
 * });
 *
 * // Desktop: 通过 IPC 暴露
 * // TUI: 直接使用 runtime.session
 * ```
 */

// 导出本地模式 API
export { createLocalRuntime } from './local.js'

// 导出类型
export type { LocalRuntimeConfig, LocalRuntimeInstance } from './types.js'

// 导出 Observational Memory 配置
export { applyOmConfigToInitialState } from './mastra/index.js'
export type {
  RuntimeObservationalMemoryConfig,
  RuntimeObserveAttachments,
  RuntimeOmScope
} from './mastra/index.js'

export { defineRuntimeModel, resolveAgentModel } from './models/index.js'

export { createRuntimeProviderService } from './providers/index.js'
export { createRuntimeSessionService } from './sessions/index.js'
export { createRuntimeSkillService } from './skills/index.js'
export { createRuntimeAutomationService } from './automations/index.js'
export { createRuntimeMcpService } from './mcp/index.js'
export { createRuntimeStateSearchService } from './state-search/index.js'
export { createRuntimeOmService } from './om/index.js'
export type { RuntimeOmService, RuntimeOmStatus, UpdateRuntimeOmInput } from './om/index.js'
export {
  createRuntimeToolExecutor,
  RuntimeToolError,
  RuntimeToolExecutor,
  RuntimeToolLimiter,
  RuntimeToolRegistry
} from './tools/index.js'
export type {
  RuntimeTool,
  RuntimeToolCommand,
  RuntimeToolContext,
  RuntimeToolErrorCode,
  RuntimeToolExecutionPolicy,
  RuntimeToolGuard,
  RuntimeToolKind,
  RuntimeToolResult
} from './tools/index.js'
export { createRuntimePentestService } from './pentest/index.js'
export { createPentestWorkflow, createRuntimePentestWorkflow } from './pentest/index.js'
export { createRuntimePentestDriver } from './pentest/index.js'
export { createHostedPentestDriver } from './pentest/index.js'
export { createPentestExplorer, createPentestPlanner } from './pentest/index.js'
export type { PentestToolCatalogEntry } from './pentest/index.js'
export { createPentestCreationParser } from './pentest/index.js'
export type {
  PentestCreationParserOptions,
  RuntimePentestCreationIntent
} from './pentest/index.js'
export { createRuntimeExpertService } from './experts/index.js'
export type { RuntimeExpertService } from './experts/index.js'
export {
  DEFAULT_EXPERTS_DIRNAME,
  deleteExpertFile,
  expertFrontmatterSchema,
  expertToMode,
  expertsDirectory,
  parseExpertFile,
  scanExpertModes,
  serializeExpertDefinition,
  writeExpertFile
} from './experts/index.js'
export type {
  RuntimeExpertDefinition,
  RuntimeExpertFrontmatter,
  RuntimeExpertSaveInput,
  RuntimeExpertScanResult
} from './experts/index.js'
export { createFilePentestEvidenceStore, FilePentestEvidenceStore } from './pentest/index.js'
export { createFilePentestStore, FilePentestStore } from './pentest/index.js'
export {
  createRuntimePentestToolExecutor,
  RuntimePentestToolError,
  RuntimePentestToolExecutor
} from './pentest/index.js'
export type {
  RuntimePentestExecutionPolicy,
  RuntimePentestTool,
  RuntimePentestToolCommand,
  RuntimePentestToolContext,
  RuntimePentestToolKind,
  RuntimePentestToolResult
} from './pentest/index.js'
export {
  assertCommandActionAllowed,
  assertHttpActionAllowed,
  classifyCommandAction,
  classifyHttpRequest,
  createCrawlAuthenticatedTool,
  createDetectAuthSchemeTool,
  createDocumentAppTool,
  createDocumentEndpointTool,
  createExtractJsEndpointsTool,
  createHttpProbeTool,
  createHttpRequestTool,
  createTcpConnectTool,
  createTestEndpointVariationsTool,
  createWorkspaceReadTextTool,
  DEFAULT_PENTEST_TOOLS,
  DestructiveActionError,
  isTargetInScope
} from './pentest/index.js'
export { createSecurityMastraTools } from './tools/security-tools/index.js'
export {
  createKaliSandboxTools,
  KALI_SANDBOX_LOCAL_TARGET
} from './tools/security-tools/index.js'

// Kali 沙箱执行层（SPI + docker CLI 实现 + mock）
export {
  createDockerSandboxAdapter,
  createMockSandboxAdapter,
  createSpawnDockerRunner,
  buildExecScript,
  sanitizeSessionName,
  shquote,
  truncateOutput,
  DEFAULT_SANDBOX_IMAGE,
  DEFAULT_SANDBOX_WORKSPACE
} from './sandbox/index.js'
export type {
  DockerSandboxConfig,
  DockerSandboxOptions,
  MockSandboxAdapter,
  MockSandboxCall,
  MockSandboxOptions,
  RuntimeSandboxAdapter,
  SandboxDockerRunner,
  SandboxExecOptions,
  SandboxExecResult,
  SandboxProcessResult,
  SandboxSessionChunk,
  SandboxSessionInfo,
  SandboxState,
  SandboxStatus
} from './sandbox/index.js'

export type {
  DestructiveAuthorization,
  DestructiveClassification,
  DestructiveCategory
} from './pentest/index.js'
export type {
  RuntimePentestEvidencePack,
  RuntimePentestFindingSeverity,
  RuntimePentestStore
} from './pentest/index.js'
export {
  createRuntimePentestVerifierRegistry,
  DEFAULT_PENTEST_VERIFIER_PACKS,
  findingSeverityRank,
  highestFindingSeverity,
  RuntimePentestVerifierRegistry
} from './pentest/index.js'
export {
  createInMemoryPentestEvidenceStore,
  digestPentestEvidence,
  InMemoryPentestEvidenceStore
} from './pentest/index.js'
export type {
  HostedPentestDriverOptions,
  HostedPentestToolCommand
} from './pentest/index.js'
export type {
  RuntimePentestDriver,
  RuntimePentestDriverOptions,
  RuntimePentestDriverResumeInput,
  RuntimePentestDriverStartOptions,
  RuntimePentestDriverState,
  RuntimePentestDriverStatus
} from './pentest/index.js'
export type {
  PentestAgentModel,
  PentestExplorerOptions,
  PentestPlannerOptions,
  StructuredGenerate
} from './pentest/index.js'
export type { FilePentestEvidenceStoreOptions } from './pentest/index.js'
export { createRuntimeProjectService } from './projects/index.js'
export {
  createFileProjectStore,
  createMemoryProjectStore,
  FileProjectStore,
  MemoryProjectStore
} from './projects/index.js'
export type {
  RuntimeProject,
  RuntimeProjectCreateInput,
  RuntimeProjectService,
  RuntimeProjectStore
} from './projects/index.js'
export type {
  CreateRuntimeScheduleInput,
  RuntimeAgentSchedule,
  RuntimeAutomationService,
  RuntimeSchedule,
  RuntimeScheduleTrigger,
  RuntimeWorkflowSchedule,
  UpdateRuntimeScheduleInput
} from './automations/index.js'
export type {
  RuntimeMcpConfigPaths,
  RuntimeMcpOAuthConfig,
  RuntimeMcpServer,
  RuntimeMcpServerConfig,
  RuntimeMcpServerConfigSummary,
  RuntimeMcpProjectConfig,
  RuntimeMcpServerStatus,
  RuntimeMcpService
} from './mcp/index.js'
export type {
  LoginRuntimeProviderInput,
  RuntimeCustomProviderInfo,
  RuntimeCustomProviderProtocol,
  RuntimeProviderCredentialSource,
  RuntimeProviderInfo,
  RuntimeProviderOAuthCallbacks,
  RuntimeProviderOAuthInfo,
  RuntimeProviderOAuthMode,
  RuntimeProviderService,
  SetRuntimeProviderApiKeyInput,
  UpsertRuntimeCustomProviderInput
} from './providers/index.js'
export type {
  RespondRuntimeAccessRequestInput,
  RuntimeAccessRequest,
  CreateRuntimeSessionInput,
  RuntimeSessionAttachment,
  RuntimeSessionEvent,
  RuntimeSessionEventListener,
  RuntimeSessionMessage,
  RuntimeSessionMessageBlock,
  RuntimeSessionReasoningBlock,
  RuntimeSessionService,
  RuntimeSessionSnapshot,
  RuntimeSessionSummary,
  RuntimeSessionTextBlock,
  RuntimeSessionToolBlock,
  RuntimeSessionToolStatus,
  RuntimeTokenUsage,
  SendRuntimeSessionMessageInput,
  UpdateRuntimeSessionInput
} from './sessions/index.js'
export type {
  InvokeRuntimeSkillInput,
  ListRuntimeSkillsInput,
  RuntimeSkillInfo,
  RuntimeSkillSearchResult,
  RuntimeSkillService,
  SearchRuntimeSkillsInput
} from './skills/index.js'
export type {
  RuntimeModelConfig,
  RuntimeModelId,
  RuntimeModelInfo,
  RuntimeModelScope,
  RuntimeModelSelection,
  RuntimeModelService,
  SwitchRuntimeModelInput,
  SwitchSubagentModelInput
} from './models/index.js'
export type {
  RuntimeSearchAuthorization,
  RuntimeSearchBoardSnapshot,
  RuntimeSearchEvent,
  RuntimeSearchExecutionMode,
  RuntimeSearchExploreDecision,
  RuntimeSearchFact,
  RuntimeSearchHint,
  RuntimeSearchIntent,
  RuntimeSearchLease,
  RuntimeSearchProjectConfig,
  RuntimeSearchReasonContext,
  RuntimeSearchReasonDecision,
  RuntimeSearchRunOptions,
  RuntimeSearchStatus,
  RuntimeSearchWorkerContext,
  RuntimeStateSearchProject,
  RuntimeStateSearchService
} from './state-search/index.js'
export type {
  RuntimePentestEngagement,
  RuntimePentestEngagementConfig,
  RuntimePentestEngagementSnapshot,
  RuntimePentestEvidenceInput,
  RuntimePentestEvidenceRecord,
  RuntimePentestEvidenceVerification,
  RuntimePentestEvidenceStore,
  RuntimePentestEvidenceRule,
  RuntimePentestFactVerification,
  RuntimePentestEvent,
  RuntimePentestService,
  RuntimePentestVerificationStatus
} from './pentest/index.js'
export type {
  RuntimePentestApprovalContext,
  RuntimePentestExploreContext,
  RuntimePentestExploreDecision,
  RuntimePentestPlanContext,
  RuntimePentestVerifyContext,
  RuntimePentestVerifyDecision,
  RuntimePentestVerifier,
  RuntimePentestWorkflowDependencies,
  RuntimePentestWorkflowInput,
  RuntimePentestWorkflowIntent,
  RuntimePentestWorkflowOutput
} from './pentest/index.js'

// 重新导出 Mastra SDK 类型（便于使用）
export type {
  AgentController,
  AgentControllerMode,
  AgentControllerSubagent,
  Session as AgentControllerSession
} from '@mastra/core/agent-controller'

// 导出 controller 配置
export { createControllerConfig } from './mastra/index.js'
export type { ControllerConfigOptions } from './mastra/index.js'
export { createRuntimeVectorStore } from './mastra/index.js'

// 导出 modes 和 subagents
export {
  defaultModes,
  customModes,
  allModes,
  pentestMode,
  auditMode,
  ATLAS_BRAND_PREAMBLE,
  customSubagents,
  securityAuditorSubagent,
  testGeneratorSubagent,
  perfOptimizerSubagent,
  refactorAssistantSubagent,
  docWriterSubagent
} from './mastra/index.js'
export type { RuntimeModeInfo } from './mastra/index.js'
