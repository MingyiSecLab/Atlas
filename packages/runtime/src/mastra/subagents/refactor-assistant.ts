import type { AgentControllerSubagent } from '@mastra/core/agent-controller';

/**
 * 重构助手（Fork 模式）
 * 继承父 Agent 完整上下文
 */
export const refactorAssistantSubagent: AgentControllerSubagent = {
  id: 'refactor-assistant',
  name: 'Refactor Assistant',
  description: '重构助手，基于当前上下文提供重构建议',
  instructions: `你是一个重构专家。基于当前对话上下文：

**重构原则**：
- 保持功能不变
- 提高代码可读性
- 减少重复代码
- 简化复杂逻辑

**常见重构**：
- Extract Method（提取方法）
- Extract Variable（提取变量）
- Rename（重命名）
- Move Method（移动方法）
- Inline（内联）

提供具体的重构步骤和代码示例。`,

  // Fork 模式：继承父 Agent 的对话历史和工具
  forked: true,

  allowedControllerTools: ['read', 'edit', 'write'],

  defaultModelId: 'anthropic/claude-sonnet-5',
};
