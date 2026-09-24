/**
 * Mastra 配置层
 *
 * 提供：
 * - MastraCodeConfig 配置工厂
 * - 自定义 modes 和 subagents
 */

export { createControllerConfig } from './controller.js'
export type { ControllerConfigOptions } from './controller.js'
export { createRuntimeVectorStore } from './vector.js'

// 导出 Observational Memory 配置
export { applyOmConfigToInitialState } from './observational-memory.js'
export type {
  RuntimeObservationalMemoryConfig,
  RuntimeObserveAttachments,
  RuntimeOmScope
} from './observational-memory.js'

// 导出 modes
export {
  defaultModes,
  customModes,
  allModes,
  pentestMode,
  auditMode,
  ATLAS_BRAND_PREAMBLE
} from './modes.js'
export type { RuntimeModeInfo } from './modes.js'

// 导出自定义 subagents
export { customSubagents, builtinSubagents, allSubagents } from './subagents/index.js'
export {
  securityAuditorSubagent,
  testGeneratorSubagent,
  perfOptimizerSubagent,
  refactorAssistantSubagent,
  docWriterSubagent
} from './subagents/index.js'
