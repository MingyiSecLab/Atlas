/**
 * 安全工具域：面向授权安全评估的 HTTP 交互与侦察类工具。
 *
 * 成员实现 pentest 的 RuntimePentestTool 契约，经 DEFAULT_PENTEST_TOOLS
 * 暴露给 pentest 域的 executor 与安全闸调度；新增工具在本目录追加文件后
 * 于本入口汇总导出。
 */
export { createCrawlAuthenticatedTool } from './crawlAuthenticated.js'
export { createDetectAuthSchemeTool } from './detectAuthScheme.js'
export { createDocumentAppTool, resolvePentestArtifactsRoot } from './documentApp.js'
export { createDocumentEndpointTool } from './documentEndpoint.js'
export { createExtractJsEndpointsTool } from './extract-js-endpoints.js'
export { createHttpRequestTool } from './http-request.js'
export { createProbeAuthEndpointsTool } from './probe-auth-endpoints.js'
export { createRunCodeQueryTool } from './run-code-query.js'
export { createTestEndpointVariationsTool } from './testEndpointVariations.js'
export { createValidateDiscoveryTool } from './validate-discovery.js'
export {
  createKaliSandboxTools,
  DEFAULT_SANDBOX_BASE_WORKSPACE,
  KALI_SANDBOX_LOCAL_TARGET,
  resolveSessionSandboxPath,
  resolveSessionWorkspaceDir,
  sanitizeSessionDirName
} from './kali-sandbox.js'
export type { KaliSandboxToolOptions } from './kali-sandbox.js'
export {
  createDetectSandboxTool,
  detectSandboxEnvironment,
  formatDetectSandboxReport
} from './detect-sandbox.js'
export type {
  DetectSandboxDiagnostic,
  DetectSandboxToolOptions,
  SandboxStatusLevel
} from './detect-sandbox.js'
export { createSecurityMastraTools } from './mastra-adapters.js'

