/**
 * Runtime 通用工具层：宿主工具的注册表与执行策略（ADR-0003）。
 *
 * 本层承载跨域复用的机制：注册表白名单、超时、abort 传播、并发控制、
 * 速率限制、输出截断。不承载任何域业务语义。
 */
export {
  DEFAULT_TOOL_MAX_CONCURRENT,
  DEFAULT_TOOL_MIN_INTERVAL_MS,
  DEFAULT_TOOL_TIMEOUT_MS,
  MAX_TOOL_OUTPUT_LENGTH,
  RuntimeToolLimiter,
  isToolTimeout,
  raceToolAbort,
  truncateToolOutput,
  withToolTimeout
} from './execution-policy.js'
export { createRuntimeToolExecutor, RuntimeToolExecutor } from './executor.js'
export { RuntimeToolRegistry } from './registry.js'
export { RuntimeToolError } from './types.js'
export type {
  RuntimeTool,
  RuntimeToolCommand,
  RuntimeToolContext,
  RuntimeToolErrorCode,
  RuntimeToolExecutionPolicy,
  RuntimeToolGuard,
  RuntimeToolKind,
  RuntimeToolResult
} from './types.js'
