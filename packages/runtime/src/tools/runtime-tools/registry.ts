/**
 * 工具注册表：白名单持有工具定义。
 * 未注册的工具名以 `unknown_tool` 拒绝；重名在注册时立即失败。
 */
import type { RuntimeTool } from './types.js'

export class RuntimeToolRegistry {
  private readonly tools = new Map<string, RuntimeTool>()

  constructor(tools: readonly RuntimeTool[] = []) {
    for (const tool of tools) this.register(tool)
  }

  register(tool: RuntimeTool): void {
    if (!tool.name || typeof tool.execute !== 'function')
      throw new Error(`Invalid tool definition: ${tool.name}.`)
    if (this.tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}.`)
    this.tools.set(tool.name, tool)
  }

  get(toolName: string): RuntimeTool | undefined {
    return this.tools.get(toolName)
  }

  list(): readonly RuntimeTool[] {
    return [...this.tools.values()]
  }
}
