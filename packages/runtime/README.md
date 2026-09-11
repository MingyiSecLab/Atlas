# @mingyi/runtime

Mingyi Runtime 提供统一的 AgentController 创建和管理接口，基于 `@mastra/code-sdk` 实现。

## 架构模式

当前采用 **本地模式（Local Mode）**：
- Desktop：通过 IPC 与 AgentController 通信
- TUI：直接调用 AgentController API
- 无需 HTTP Server，性能最优、安全性最高

详见：[ADR-0001 本地模式架构决策](../../docs/adr/runtime/0001-local-mode-architecture.md)

## 安装

```bash
npm install @mingyi/runtime
```

## 快速开始

### 基础使用

```typescript
import { createLocalRuntime } from '@mingyi/runtime';

const runtime = await createLocalRuntime({
  workspacePath: '/path/to/project',
});

// Desktop: 通过 IPC 暴露 runtime.sessions 的可序列化接口
// TUI: 简单场景可直接使用 runtime.session

await runtime.shutdown();
```

### 使用自定义 Modes

```typescript
import { createLocalRuntime, customModes } from '@mingyi/runtime';

const runtime = await createLocalRuntime({
  workspacePath: '/path/to/project',
  modes: customModes, // [architect, review, docs, test]
});
```

### 使用自定义 Subagents

```typescript
import { createLocalRuntime, customSubagents } from '@mingyi/runtime';

const runtime = await createLocalRuntime({
  workspacePath: '/path/to/project',
  subagents: customSubagents, // [security-auditor, test-generator, ...]
});
```

### 统一模型配置

Runtime 使用 Mastra Model Router 的 `provider/model` 字符串作为两套 SDK 的共同模型标识：

```typescript
import {
  createLocalRuntime,
  customModes,
  customSubagents,
  defineRuntimeModel,
} from '@mingyi/runtime';

const runtime = await createLocalRuntime({
  workspacePath: '/path/to/project',
  modes: customModes,
  subagents: customSubagents,
  models: {
    defaultModelId: defineRuntimeModel('openai/gpt-5.6-sol'),
    modes: {
      review: defineRuntimeModel('openai/gpt-5-mini'),
    },
    subagents: {
      defaultModelId: defineRuntimeModel('openai/gpt-5-mini'),
      byId: {
        'security-auditor': defineRuntimeModel('openai/gpt-5.6-sol'),
      },
    },
  },
});

const current = runtime.models.getCurrent();

await runtime.models.switchModel({
  modelId: defineRuntimeModel('openai/gpt-5-mini'),
});

await runtime.models.switchSubagentModel({
  modelId: defineRuntimeModel('openai/gpt-5-mini'),
  subagentId: 'security-auditor',
});
```

普通 Mastra Agent 在构造时使用同一个配置解析器：

```typescript
import { Agent } from '@mastra/core/agent';
import { resolveAgentModel } from '@mingyi/runtime';

const agent = new Agent({
  id: 'title-generator',
  name: 'Title Generator',
  instructions: 'Generate concise conversation titles.',
  model: resolveAgentModel(modelConfig, 'title-generator'),
});
```

配置优先级为：Agent/Mode/Subagent 专用配置 > 类别默认值 > 全局 `defaultModelId` > 资源自身默认值。

### Provider 凭据管理

`runtime.providers` 统一管理 Model Provider 的凭据。API Key 和 OAuth Token 由
`@mastra/code-sdk` 的 `AuthStorage` 持久化，接口只返回凭据状态，不返回凭据明文：

```typescript
const providers = await runtime.providers.list();
// [{ provider: 'openai', source: 'oauth' | 'stored' | 'env' | 'none', ... }]

await runtime.providers.setApiKey({
  provider: 'openai',
  key: process.env.OPENAI_API_KEY!,
});

await runtime.providers.removeApiKey('openai');
```

OAuth Provider 及其登录模式来自 Code SDK。交互回调由 Desktop Main Process 或 TUI 提供：

```typescript
const oauthProviders = runtime.providers.listOAuth();

await runtime.providers.login({
  provider: 'openai',
  callbacks: {
    onAuth: ({ url }) => openExternal(url),
    onPrompt: ({ message }) => promptForCode(message),
  },
});

await runtime.providers.logout('openai');
```

自定义 OpenAI-compatible 端点复用 Code SDK 的 `customProviders` 设置和模型目录：

```typescript
await runtime.providers.upsertCustom({
  name: 'Local Models',
  url: 'http://127.0.0.1:11434/v1',
  models: ['qwen3-coder', 'deepseek-r1'],
  apiKey: process.env.LOCAL_MODEL_API_KEY,
});

const customProviders = runtime.providers.listCustom();
// 仅返回 hasApiKey，不返回密钥明文

await runtime.providers.removeCustom('local-models');
```

Code SDK 目录返回的 `mastracode/<provider>/<model>` 会在 Runtime 边界规范化为应用使用的
`<provider>/<model>`，避免把 Gateway 前缀持久化到模型选择中。

凭据来源优先级为 `oauth > stored > env > none`。写入或删除凭据后，Runtime 会刷新模型目录。
Desktop Renderer 不应直接访问 `AuthStorage`；由 Main Process 将状态和命令通过 IPC 暴露，且 IPC
响应中不得包含 Key 或 Token。

Desktop 已在 `apps/desktop/src/main/provider-service.ts` 接入该接口：Runtime 由 Main Process
按需创建，Preload 仅暴露类型化的 `window.api.providers`，OAuth 的浏览器跳转和验证码回调也由
Main Process 协调。设置页默认只显示已配置的服务；未配置的标准供应商和自定义模型通过“添加”
弹窗接入。

### Session 管理

`runtime.sessions` 是面向应用层的多会话接口。每个 Desktop 任务对应一个独立的官方
AgentController Session，并持久化到 Mastra Storage；Runtime 重启后可以恢复会话列表和消息历史。

```typescript
const task = await runtime.sessions.create({
  title: '检查登录流程',
  modeId: 'plan',
  modelId: 'openai/gpt-5.6-luna',
});

const unsubscribe = runtime.sessions.subscribe((event) => {
  // message、run_state、session_changed 或 error
  publishToRenderer(event);
});

await runtime.sessions.sendMessage({
  sessionId: task.id,
  content: '分析当前实现并给出修改计划',
});

await runtime.sessions.abort(task.id);
unsubscribe();
```

该接口支持 `list`、`create`、`get`、`update`、`delete`、`sendMessage`、`abort` 和
`subscribe`。返回值仅包含可序列化快照、消息块和事件，不向 Renderer 暴露 Session、Controller、
`Map` 或 `Error` 实例。

## 内置自定义配置

### 有界状态空间搜索（授权安全评估）

Runtime 提供 `runtime.stateSearch`，移植 Cairn 的黑板思想，但只负责保存可审计的
Fact、Intent、Hint 和租约协调。它不会执行命令、发起网络请求、扫描目标或尝试利用漏洞；
实际探索必须由调用方传入受控的 `reason` / `explore` 回调，并且创建项目时必须提供明确的
授权主体、授权范围和授权引用。默认是只读语义，调用方可以把 `executionMode` 标成
`authorized-active` 以表达已获批准的主动验证范围，但 Runtime 仍不提供任意执行器。

```typescript
const project = runtime.stateSearch.create({
  title: '登录流程安全评估',
  origin: 'workspace://checkout',
  goal: '每个发现都有可复现证据和修复建议',
  authorization: {
    principal: 'security-team',
    scope: ['workspace://checkout'],
    authorizationRef: 'ENG-1234',
    executionMode: 'read-only',
  },
})

await project.run({
  worker: 'security-agent',
  maxSteps: 10,
  reason: async ({ board }) => ({
    type: 'intents',
    intents: [{ from: ['origin'], description: `审查 ${board.title} 的信任边界` }],
  }),
  explore: async ({ intent }) => ({
    type: 'fact',
    description: `${intent.description} 已生成审计证据`,
  }),
})
```

服务内置步数、并发、图规模、描述长度、租约和授权有效期限制；所有状态变更可通过
`subscribe` 监听，用于 UI、日志或外部审计存储。

### Modes（工作模式）

| ID | 名称 | 描述 | 权限 |
|----|------|------|------|
| `architect` | Architect | 系统架构设计，技术选型和架构决策 | 只读 |
| `review` | Review | 代码审查，检查质量、安全和最佳实践 | 只读 |
| `docs` | Docs | 技术文档撰写和更新 | 读写（无执行） |
| `test` | Test | 测试生成和执行 | 读写执行 |

### Subagents（专业子 Agent）

| ID | 名称 | 描述 |
|----|------|------|
| `security-auditor` | Security Auditor | 安全审计，识别漏洞和风险 |
| `test-generator` | Test Generator | 生成高质量测试用例 |
| `perf-optimizer` | Performance Optimizer | 性能分析和优化建议 |
| `refactor-assistant` | Refactor Assistant | 重构建议（Fork 模式） |
| `doc-writer` | Documentation Writer | 生成清晰的技术文档 |

## 使用示例

### 1. Desktop 应用（Electron IPC）

```typescript
// apps/desktop/src/main/runtime-service.ts
import { createLocalRuntime, customModes, customSubagents } from '@mingyi/runtime';
import { ipcMain } from 'electron';

let runtime;

async function initRuntime(workspacePath: string) {
  runtime = await createLocalRuntime({
    workspacePath,
    modes: customModes,
    subagents: customSubagents,
  });

  // Main Process 持有 Runtime，Renderer 只接收纯数据。
  ipcMain.handle('runtime:session:list', () => runtime.sessions.list());
  ipcMain.handle('runtime:session:create', (_, input) => {
    return runtime.sessions.create(input);
  });
  ipcMain.handle('runtime:session:send-message', (_, input) => {
    return runtime.sessions.sendMessage(input);
  });

  runtime.sessions.subscribe((event) => mainWindow.webContents.send(
    'runtime:session:event',
    event,
  ));
}

// 应用关闭时
async function cleanup() {
  await runtime?.shutdown();
}
```

### 2. TUI 应用（直接调用）

```typescript
// apps/tui/src/index.ts
import { createLocalRuntime, customModes } from '@mingyi/runtime';

async function main() {
  const runtime = await createLocalRuntime({
    workspacePath: process.cwd(),
    modes: customModes,
  });

  // 直接使用 session
  await runtime.session.sendMessage({
    content: 'Analyze the architecture of this project',
  });

  await runtime.shutdown();
}
```

### 3. 自定义 Mode

```typescript
import { createLocalRuntime } from '@mingyi/runtime';
import type { AgentControllerMode } from '@mingyi/runtime';

const translatorMode: AgentControllerMode = {
  id: 'translator',
  name: 'Translator',
  description: '代码翻译：TypeScript ↔ Go ↔ Rust',
  instructions: '你是代码翻译专家...',
  availableTools: ['read', 'write', 'edit'],
  defaultModelId: 'anthropic/claude-sonnet-5',
};

const runtime = await createLocalRuntime({
  workspacePath: '/path/to/project',
  modes: [translatorMode],
});
```

### 4. 自定义 Subagent

```typescript
import { createLocalRuntime } from '@mingyi/runtime';
import type { AgentControllerSubagent } from '@mingyi/runtime';

const i18nExpert: AgentControllerSubagent = {
  id: 'i18n-expert',
  name: 'i18n Expert',
  description: '国际化专家',
  instructions: '你是国际化专家...',
  allowedControllerTools: ['read', 'write', 'edit'],
  defaultModelId: 'anthropic/claude-sonnet-5',
  maxSteps: 20,
};

const runtime = await createLocalRuntime({
  workspacePath: '/path/to/project',
  subagents: [i18nExpert],
});
```

## API 参考

### `createLocalRuntime(config)`

创建本地模式 Runtime 实例。

**参数**：
```typescript
interface LocalRuntimeConfig {
  workspacePath: string;           // Workspace 根目录
  homeDir?: string;                 // 全局配置根目录，默认 os.homedir()
  configDir?: string;               // 配置目录名，默认 .mastracode
  modes?: AgentControllerMode[];    // 自定义 modes
  subagents?: AgentControllerSubagent[];  // 自定义 subagents
  models?: RuntimeModelConfig;      // 统一模型配置
  extraTools?: Record<string, any>; // 额外工具
  disabledTools?: string[];         // 禁用工具
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
```

**返回**：
```typescript
interface LocalRuntimeInstance {
  controller: AgentController;      // Controller 实例
  session: Session;                 // 启动时创建的默认 Session
  models: RuntimeModelService;      // 模型查询和切换
  providers: RuntimeProviderService; // Provider 凭据管理
  sessions: RuntimeSessionService;  // 应用层多会话、消息和事件接口
  shutdown: () => Promise<void>;    // 关闭函数
}
```

### 内置导出

```typescript
// Modes
export {
  customModes,           // 所有自定义 modes
  architectMode,         // 架构设计模式
  reviewMode,           // 代码审查模式
  docsMode,             // 文档模式
  testMode,             // 测试模式
};

// Subagents
export {
  customSubagents,              // 所有自定义 subagents
  securityAuditorSubagent,      // 安全审计
  testGeneratorSubagent,        // 测试生成
  perfOptimizerSubagent,        // 性能优化
  refactorAssistantSubagent,    // 重构助手
  docWriterSubagent,            // 文档生成
};
```

## 目录结构

```
src/
├── index.ts                   # 入口，导出所有公开 API
├── local.ts                   # 本地模式实现
├── types.ts                   # TypeScript 类型定义
├── paths.ts                   # 路径规范化工具
├── config.ts                  # 配置处理
├── models/                    # 统一模型配置和 Session 适配
│   ├── index.ts
│   ├── types.ts
│   ├── config.ts
│   └── service.ts
├── providers/                 # Provider 状态、API Key 和 OAuth 管理
│   ├── index.ts
│   ├── types.ts
│   └── service.ts
├── sessions/                  # 多会话、消息序列化和事件适配
│   ├── index.ts
│   ├── types.ts
│   ├── messages.ts
│   └── service.ts
└── mastra/                    # Mastra 配置层
    ├── index.ts              # Mastra 导出
    ├── controller.ts         # MastraCodeConfig 工厂
    ├── modes.ts              # 自定义 modes
    └── subagents/            # 自定义 subagents
        ├── index.ts          # 聚合导出和默认列表
        ├── security-auditor.ts
        ├── test-generator.ts
        ├── performance-optimizer.ts
        ├── refactor-assistant.ts
        └── documentation-writer.ts
```

## 更多示例

查看 `examples/usage.ts` 获取完整的使用示例。

## 相关文档

- [架构决策记录：本地模式](../../docs/adr/runtime/0001-local-mode-architecture.md)
- [运行时架构设计](../../docs/architecture/runtime/runtime-architecture.md)
- [自定义 Modes 和 Subagents](../../docs/design/runtime/custom-modes-and-agents.md)
- [实现任务清单](../../docs/tasks/runtime/runtime-implementation.md)

## License

MIT
