/**
 * Runtime 通用工具层：宿主工具的注册表与执行策略（见 ADR-0003）。
 *
 * 本层只承载跨域复用的机制（注册表白名单、超时、abort、并发、速率、截断）；
 * 域实现（如 pentest 工具域）由各自域目录组织自己的入口，不经过本文件。
 */

// 通用 Runtime 工具层（跨域复用机制）
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
} from './runtime-tools/execution-policy.js'
export { runSpawnBounded } from './runtime-tools/bounded-process.js'
export type { BoundedSpawnInput, BoundedSpawnResult } from './runtime-tools/bounded-process.js'
export { createRuntimeToolExecutor, RuntimeToolExecutor } from './runtime-tools/executor.js'
export { RuntimeToolRegistry } from './runtime-tools/registry.js'
export { RuntimeToolError } from './runtime-tools/types.js'
export type {
  RuntimeTool,
  RuntimeToolCommand,
  RuntimeToolContext,
  RuntimeToolErrorCode,
  RuntimeToolExecutionPolicy,
  RuntimeToolGuard,
  RuntimeToolKind,
  RuntimeToolResult
} from './runtime-tools/types.js'

