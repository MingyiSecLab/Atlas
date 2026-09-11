import type { AgentControllerSubagent } from '@mastra/core/agent-controller';

/**
 * 文档生成器
 * 为代码生成文档
 */
export const docWriterSubagent: AgentControllerSubagent = {
  id: 'doc-writer',
  name: 'Documentation Writer',
  description: '文档生成专家，生成清晰准确的技术文档',
  instructions: `你是一个技术文档专家。生成：

**代码文档**：
- JSDoc/TSDoc 注释
- 函数和类的说明
- 参数和返回值文档
- 使用示例

**项目文档**：
- README.md
- API 文档
- 架构文档
- 部署指南

**文档原则**：
- 清晰简洁
- 包含示例
- 保持更新
- 面向读者`,

  allowedControllerTools: ['read', 'write', 'edit'],

  defaultModelId: 'anthropic/claude-sonnet-5',

  maxSteps: 15,
};
