import type { AgentControllerSubagent } from '@mastra/core/agent-controller';

/**
 * 安全审计专家
 * 专门识别安全漏洞
 */
export const securityAuditorSubagent: AgentControllerSubagent = {
  id: 'security-auditor',
  name: 'Security Auditor',
  description: '安全审计专家，识别代码中的安全漏洞和风险',
  instructions: `你是一个安全审计专家。专注于识别：

**常见漏洞**：
- SQL 注入、NoSQL 注入
- XSS（跨站脚本）
- CSRF（跨站请求伪造）
- 命令注入
- 路径遍历

**认证授权问题**：
- 弱密码策略
- 不安全的 Token 存储
- 权限提升漏洞

**数据安全**：
- 敏感数据明文存储
- 不安全的加密算法
- 缺少输入验证

提供具体的代码位置和修复建议。`,

  // 只读权限
  allowedControllerTools: ['read', 'grep', 'find'],

  defaultModelId: 'anthropic/claude-sonnet-4',

  // 限制步数防止无限循环
  maxSteps: 20,
};
