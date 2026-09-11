/**
 * Mingyi Runtime 使用示例
 */

import {
  createLocalRuntime,
  customModes,
  customSubagents,
  auditMode,
  securityAuditorSubagent,
} from '@mingyi/runtime';
import type {
  LocalRuntimeConfig,
  AgentControllerMode,
  AgentControllerSubagent,
} from '@mingyi/runtime';

/**
 * 示例 1：使用默认配置
 */
async function example1_basic() {
  const runtime = await createLocalRuntime({
    workspacePath: '/path/to/project',
  });

  console.log('Runtime created with default modes and subagents');

  await runtime.shutdown();
}

/**
 * 示例 2：使用内置的自定义 modes 和 subagents
 */
async function example2_withCustomConfig() {
  const runtime = await createLocalRuntime({
    workspacePath: '/path/to/project',
    configDir: '.mingyi',

    // 使用所有内置自定义 modes
    modes: customModes, // [pentest, audit]

    // 使用所有内置自定义 subagents
    subagents: customSubagents, // [security-auditor, test-generator, ...]
  });

  console.log('Runtime created with all custom modes and subagents');

  await runtime.shutdown();
}

/**
 * 示例 3：只使用部分自定义配置
 */
async function example3_selective() {
  const runtime = await createLocalRuntime({
    workspacePath: '/path/to/project',

    // 只启用审计模式
    modes: [auditMode],

    // 只启用安全审计
    subagents: [securityAuditorSubagent],
  });

  console.log('Runtime created with selective modes and subagents');

  await runtime.shutdown();
}

/**
 * 示例 4：定义自己的 mode
 */
async function example4_customMode() {
  const myCustomMode: AgentControllerMode = {
    id: 'translator',
    name: 'Translator',
    description: '代码翻译模式：TypeScript ↔ Go ↔ Rust',
    instructions: `你是一个代码翻译专家。专注于：
- 将 TypeScript 代码翻译为 Go
- 将 Go 代码翻译为 Rust
- 保持代码语义和功能一致
- 遵循目标语言的最佳实践`,

    availableTools: ['read', 'write', 'edit'],
    defaultModelId: 'anthropic/claude-sonnet-5',

    metadata: {
      color: '#3b82f6',
      icon: 'translate',
    },
  };

  const runtime = await createLocalRuntime({
    workspacePath: '/path/to/project',
    modes: [myCustomMode],
  });

  console.log('Runtime created with custom translator mode');

  await runtime.shutdown();
}

/**
 * 示例 5：定义自己的 subagent
 */
async function example5_customSubagent() {
  const myCustomSubagent: AgentControllerSubagent = {
    id: 'i18n-expert',
    name: 'i18n Expert',
    description: '国际化专家，帮助添加多语言支持',
    instructions: `你是一个国际化专家。负责：
- 提取硬编码文本为翻译 key
- 生成翻译文件结构
- 确保 UI 支持 RTL 语言
- 处理日期、数字、货币格式化`,

    allowedControllerTools: ['read', 'write', 'edit', 'grep'],
    defaultModelId: 'anthropic/claude-sonnet-5',
    maxSteps: 20,
  };

  const runtime = await createLocalRuntime({
    workspacePath: '/path/to/project',
    subagents: [myCustomSubagent],
  });

  console.log('Runtime created with custom i18n subagent');

  await runtime.shutdown();
}

/**
 * 示例 6：Desktop 应用中使用（IPC）
 */
async function example6_desktopUsage() {
  // 在 Desktop Main Process 中
  const runtime = await createLocalRuntime({
    workspacePath: '/path/to/project',
    modes: customModes,
    subagents: customSubagents,
  });

  // 注册 IPC Handlers
  // ipcMain.handle('agent:sendMessage', async (_, message) => {
  //   return await runtime.session.sendMessage(message);
  // });

  // ipcMain.handle('agent:switchMode', async (_, modeId) => {
  //   return await runtime.session.switchMode(modeId);
  // });

  console.log('Desktop runtime ready, IPC handlers registered');

  // 应用关闭时
  // await runtime.shutdown();
}

/**
 * 示例 7：TUI 应用中使用（直接调用）
 */
async function example7_tuiUsage() {
  // 在 TUI 应用中
  const runtime = await createLocalRuntime({
    workspacePath: process.cwd(),
    modes: customModes,
    subagents: customSubagents,
  });

  // 直接使用 session
  await runtime.session.sendMessage({
    content: 'Analyze the architecture of this project',
  });

  await runtime.shutdown();
}

/**
 * 示例 8：混合使用内置和自定义配置
 */
async function example8_mixed() {
  const myMode: AgentControllerMode = {
    id: 'database',
    name: 'Database',
    description: '数据库设计和优化专家',
    instructions: '你是数据库专家...',
    availableTools: ['read', 'write'],
    defaultModelId: 'anthropic/claude-sonnet-5',
  };

  const runtime = await createLocalRuntime({
    workspacePath: '/path/to/project',

    // 混合：内置 + 自定义
    modes: [...customModes, myMode],

    // 只使用内置 subagents
    subagents: customSubagents,
  });

  console.log('Runtime created with mixed modes');

  await runtime.shutdown();
}

/**
 * 示例 9：管理 Provider API Key
 */
async function example9_providerCredentials() {
  const runtime = await createLocalRuntime({
    workspacePath: '/path/to/project',
  });

  const providers = await runtime.providers.list();
  console.log('Provider credential status:', providers);

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (openaiApiKey) {
    await runtime.providers.setApiKey({
      provider: 'openai',
      key: openaiApiKey,
    });
  }

  await runtime.shutdown();
}

// 运行示例
async function main() {
  console.log('=== Example 1: Basic ===');
  await example1_basic();

  console.log('\n=== Example 2: With Custom Config ===');
  await example2_withCustomConfig();

  console.log('\n=== Example 3: Selective ===');
  await example3_selective();

  console.log('\n=== Example 4: Custom Mode ===');
  await example4_customMode();

  console.log('\n=== Example 5: Custom Subagent ===');
  await example5_customSubagent();

  console.log('\n=== Example 8: Mixed ===');
  await example8_mixed();

  console.log('\n=== Example 9: Provider Credentials ===');
  await example9_providerCredentials();
}

// Uncomment to run
// main().catch(console.error);
