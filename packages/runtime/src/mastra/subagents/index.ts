import type { AgentControllerSubagent } from '@mastra/core/agent-controller'
// SDK 顶层不导出内置 subagent，只能走 "./*" 通配导出映射到 dist/agents/subagents/*。
// 升级 @mastra/code-sdk 时须确认该路径仍存在（见 docs/design/runtime/subagents-wiring.md）。
import { executeSubagent } from '@mastra/code-sdk/agents/subagents/execute'
import { exploreSubagent } from '@mastra/code-sdk/agents/subagents/explore'
import { planSubagent } from '@mastra/code-sdk/agents/subagents/plan'
import { docWriterSubagent } from './documentation-writer.js'
import { perfOptimizerSubagent } from './performance-optimizer.js'
import { refactorAssistantSubagent } from './refactor-assistant.js'
import { securityAuditorSubagent } from './security-auditor.js'
import { testGeneratorSubagent } from './test-generator.js'

export {
  docWriterSubagent,
  perfOptimizerSubagent,
  refactorAssistantSubagent,
  securityAuditorSubagent,
  testGeneratorSubagent
}

/** 默认自定义 subagents 列表。 */
export const customSubagents: AgentControllerSubagent[] = [
  securityAuditorSubagent,
  testGeneratorSubagent,
  perfOptimizerSubagent,
  refactorAssistantSubagent,
  docWriterSubagent
]

/**
 * Code SDK 内置 subagents（explore/plan/execute）。
 *
 * SDK 在 config.subagents 缺省时自用这三个，但不在包顶层导出它们；这里深路径
 * 引入是为了让调用方能**合并**而非**替换**——显式传入 config.subagents 会让
 * SDK 整体丢弃默认值（`config?.subagents ?? [explore, plan, execute]`）。
 */
export const builtinSubagents: AgentControllerSubagent[] = [
  exploreSubagent,
  planSubagent,
  executeSubagent
]

/**
 * 全量 subagents：内置三个在前，自定义五个追加在后。
 *
 * 应用层（Desktop/TUI）应传这个数组，而不是 customSubagents——后者会顶掉
 * explore/plan/execute，使 plan/探索/执行循环失去支撑。内置三项无
 * defaultModelId，模型由 SDK 的 fallbackModelId / settings.json 全局
 * subagent 默认兜底。
 */
export const allSubagents: AgentControllerSubagent[] = [...builtinSubagents, ...customSubagents]
