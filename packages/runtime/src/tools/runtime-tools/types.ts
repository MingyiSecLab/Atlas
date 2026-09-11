/**
 * Runtime 通用工具契约：宿主工具（模型提议、宿主执行的命令式工具）共用的类型。
 *
 * 本层只承载机制——注册表白名单、超时、abort 传播、并发与速率、输出截断；
 * 是否放行、如何注入域上下文由各域以 `RuntimeToolGuard` 形式决定
 * （见 ADR-0003）。本层不承载任何安全语义。
 */
import type { RuntimeToolRegistry } from './registry.js'

export type RuntimeToolKind = 'read-only' | 'active'

export interface RuntimeToolCommand {
  toolName: string
  arguments: Record<string, unknown>
}

export interface RuntimeToolResult {
  output?: string
  exitCode?: number
  timedOut?: boolean
}

export interface RuntimeToolContext {
  signal: AbortSignal
}

/**
 * 域级执行前闸：在注册表查找之后、限流与工具执行之前调用。
 * 抛错即拒绝执行；返回的 context 用于在执行期间增强注入
 * （如 pentest 域注入授权 scope）。多个 guard 按数组顺序组合。
 */
export type RuntimeToolGuard = (
  command: RuntimeToolCommand,
  context: RuntimeToolContext
) => Promise<RuntimeToolContext> | RuntimeToolContext

export interface RuntimeTool {
  name: string
  kind: RuntimeToolKind
  description: string
  /** 单次执行超时毫秒数，默认 10s。 */
  timeoutMs?: number
  execute(command: RuntimeToolCommand, context: RuntimeToolContext): Promise<RuntimeToolResult>
}

export interface RuntimeToolExecutionPolicy {
  /** 执行前闸，按顺序组合；任一抛错即拒绝。 */
  guards?: readonly RuntimeToolGuard[]
  /** 全局并发上限，默认 4。 */
  maxConcurrent?: number
  /** 相邻两次执行的最小间隔毫秒数（速率限制），默认 250。 */
  minIntervalMs?: number
}

export type RuntimeToolErrorCode =
  | 'unknown_tool'
  | 'forbidden'
  | 'busy'

export class RuntimeToolError extends Error {
  readonly code: RuntimeToolErrorCode

  constructor(code: RuntimeToolErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export type { RuntimeToolRegistry }
