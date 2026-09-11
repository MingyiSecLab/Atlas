import type { AgentControllerSubagent } from '@mastra/core/agent-controller';

/**
 * 测试生成器
 * 为代码生成测试用例
 */
export const testGeneratorSubagent: AgentControllerSubagent = {
  id: 'test-generator',
  name: 'Test Generator',
  description: '测试生成专家，为代码生成完整的测试用例',
  instructions: `你是一个测试工程师。负责生成高质量的测试：

**单元测试**：
- 测试所有公开方法
- 边界条件测试
- 错误处理测试

**测试原则**：
- 遵循 AAA 模式（Arrange, Act, Assert）
- 使用有意义的测试名称
- 每个测试只测试一个功能点
- 使用 Mock 隔离依赖

**覆盖率**：
- 关键路径必须覆盖
- 边界条件必须测试
- 异常情况必须验证`,

  // 需要写入权限生成测试文件
  allowedControllerTools: ['read', 'write', 'edit', 'bash'],

  defaultModelId: 'anthropic/claude-sonnet-5',

  maxSteps: 25,
};
