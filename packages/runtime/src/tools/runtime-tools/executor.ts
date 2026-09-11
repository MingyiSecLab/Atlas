/**
 * 通用工具执行器：注册表查找 → 域闸（guards）→ 限流 → 超时/abort → 截断。
 *
 * 执行器只承载机制；guard 抛错即拒绝（域错误原样上抛，不吞成通用错误），
 * guard 返回的 context 用于执行期间增强注入（见 ADR-0003）。
 */
import {
  RuntimeToolLimiter,
  DEFAULT_TOOL_MAX_CONCURRENT,
  DEFAULT_TOOL_MIN_INTERVAL_MS,
  DEFAULT_TOOL_TIMEOUT_MS,
  isToolTimeout,
  truncateToolOutput,
  withToolTimeout
} from './execution-policy.js'
import { RuntimeToolRegistry } from './registry.js'
import type {
  RuntimeTool,
  RuntimeToolCommand,
  RuntimeToolContext,
  RuntimeToolExecutionPolicy,
  RuntimeToolResult
} from './types.js'
import { RuntimeToolError } from './types.js'

export class RuntimeToolExecutor {
  private readonly registry: RuntimeToolRegistry
  private readonly limiter = new RuntimeToolLimiter()

  constructor(tools: readonly RuntimeTool[] | RuntimeToolRegistry) {
    this.registry = tools instanceof RuntimeToolRegistry ? tools : new RuntimeToolRegistry(tools)
  }

  list(): readonly RuntimeTool[] {
    return this.registry.list()
  }

  async execute(
    command: RuntimeToolCommand,
    context: RuntimeToolContext,
    policy: RuntimeToolExecutionPolicy = {}
  ): Promise<RuntimeToolResult> {
    const tool = this.registry.get(command.toolName)
    if (!tool)
      throw new RuntimeToolError('unknown_tool', `Unknown tool: ${command.toolName}.`)

    let executionContext = context
    for (const guard of policy.guards ?? []) {
      executionContext = await guard(command, executionContext)
    }

    await this.limiter.acquire(
      policy.maxConcurrent ?? DEFAULT_TOOL_MAX_CONCURRENT,
      policy.minIntervalMs ?? DEFAULT_TOOL_MIN_INTERVAL_MS
    )
    try {
      const result = await withToolTimeout(
        tool.execute(command, executionContext),
        tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
        context.signal
      )
      return {
        ...result,
        ...(result.output !== undefined ? { output: truncateToolOutput(result.output) } : {})
      }
    } catch (error) {
      if (isToolTimeout(error))
        return { output: `Tool ${tool.name} timed out.`, exitCode: -1, timedOut: true }
      throw error
    } finally {
      this.limiter.release()
    }
  }
}

export function createRuntimeToolExecutor(
  tools: readonly RuntimeTool[] | RuntimeToolRegistry
): RuntimeToolExecutor {
  return new RuntimeToolExecutor(tools)
}
