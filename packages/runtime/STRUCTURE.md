# packages/runtime 目录结构设计完成

## 最终目录结构

```
packages/runtime/
├── package.json                        # 包配置
├── tsconfig.json                       # TypeScript 配置
├── README.md                           # 使用文档（已更新）
├── examples/
│   └── usage.ts                       # 完整使用示例
└── src/
    ├── index.ts                       # 主入口，导出所有公开 API
    ├── local.ts                       # ✨ 本地模式实现
    ├── types.ts                       # TypeScript 类型定义
    ├── paths.ts                       # 路径规范化工具
    ├── config.ts                      # [DEPRECATED] HTTP Server 配置（保留供未来使用）
    ├── models/                        # 统一模型配置和 Session 适配
    │   ├── index.ts
    │   ├── types.ts
    │   ├── config.ts
    │   └── service.ts
    ├── providers/                     # Provider 凭据管理
    │   ├── index.ts
    │   ├── types.ts
    │   └── service.ts
    └── mastra/                        # ✨ Mastra 配置层（完整实现）
        ├── index.ts                   # 导出所有 Mastra 相关配置
        ├── controller.ts              # MastraCodeConfig 工厂
        ├── modes.ts                   # ✨ 自定义 Modes
        └── subagents/                 # ✨ 自定义 Subagents
            ├── index.ts               # 聚合导出和默认列表
            ├── security-auditor.ts
            ├── test-generator.ts
            ├── performance-optimizer.ts
            ├── refactor-assistant.ts
            └── documentation-writer.ts
```

## 核心功能

### 1. 本地模式 Runtime (`src/local.ts`)

使用 `bootLocalAgentController()` 创建 AgentController，支持：
- ✅ 自定义 modes（覆盖或扩展 build/plan/fast）
- ✅ 自定义 subagents（覆盖或扩展 explore/plan/execute）
- ✅ extraTools 额外工具
- ✅ disabledTools 禁用工具

### 2. 自定义 Modes (`src/mastra/modes.ts`)

提供 4 个开箱即用的自定义模式：

| Mode ID | 名称 | 用途 | 权限 |
|---------|------|------|------|
| `architect` | Architect | 系统架构设计 | 只读 |
| `review` | Review | 代码审查 | 只读 |
| `docs` | Docs | 文档撰写 | 读写（无执行） |
| `test` | Test | 测试生成和执行 | 读写执行 |

### 3. 自定义 Subagents (`src/mastra/subagents/`)

提供 5 个专业子 Agent：

| Subagent ID | 名称 | 用途 |
|-------------|------|------|
| `security-auditor` | Security Auditor | 安全审计 |
| `test-generator` | Test Generator | 测试生成 |
| `perf-optimizer` | Performance Optimizer | 性能优化 |
| `refactor-assistant` | Refactor Assistant | 重构建议（Fork 模式） |
| `doc-writer` | Documentation Writer | 文档生成 |

### 4. Provider 凭据管理 (`src/providers/`)

复用 Code SDK `AuthStorage` 和 Provider Registry，通过 `runtime.providers` 提供：

- Provider 凭据状态查询，不返回 API Key 或 OAuth Token
- API Key 的持久化和删除
- OAuth Provider/登录模式查询、登录和退出
- 凭据变化后的模型目录缓存刷新

Desktop 应在 Main Process 中持有 Runtime，并通过 IPC 暴露这些能力；Renderer 不直接读写凭据文件。

### 5. 类型定义 (`src/types.ts`)

完整的 TypeScript 类型：
```typescript
interface LocalRuntimeConfig {
  workspacePath: string;
  homeDir?: string;
  configDir?: string;
  modes?: AgentControllerMode[];
  subagents?: AgentControllerSubagent[];
  models?: RuntimeModelConfig;
  extraTools?: Record<string, any>;
  disabledTools?: string[];
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

interface LocalRuntimeInstance {
  controller: AgentController;
  session: AgentControllerSession;
  models: RuntimeModelService;
  providers: RuntimeProviderService;
  shutdown: () => Promise<void>;
}
```

## 公开 API

```typescript
// 主函数
import { createLocalRuntime } from '@mingyi/runtime';

// 类型
import type {
  LocalRuntimeConfig,
  LocalRuntimeInstance,
  AgentControllerMode,
  AgentControllerSubagent,
} from '@mingyi/runtime';

// 内置自定义配置
import {
  customModes,              // 所有 modes
  architectMode,            // 单个 mode
  reviewMode,
  docsMode,
  testMode,
  customSubagents,          // 所有 subagents
  securityAuditorSubagent,  // 单个 subagent
  testGeneratorSubagent,
  perfOptimizerSubagent,
  refactorAssistantSubagent,
  docWriterSubagent,
} from '@mingyi/runtime';
```

## 使用示例

### Desktop（IPC 模式）

```typescript
import { createLocalRuntime, customModes } from '@mingyi/runtime';
import { ipcMain } from 'electron';

const runtime = await createLocalRuntime({
  workspacePath: '/path/to/project',
  modes: customModes,
});

ipcMain.handle('agent:sendMessage', async (_, msg) => {
  return await runtime.session.sendMessage(msg);
});
```

### TUI（直接调用）

```typescript
import { createLocalRuntime } from '@mingyi/runtime';

const runtime = await createLocalRuntime({
  workspacePath: process.cwd(),
});

await runtime.session.sendMessage({
  content: 'Implement login feature',
});
```

### 自定义配置

```typescript
import { createLocalRuntime, customModes } from '@mingyi/runtime';
import type { AgentControllerMode } from '@mingyi/runtime';

const myMode: AgentControllerMode = {
  id: 'translator',
  name: 'Translator',
  description: 'Code translator',
  instructions: '...',
  availableTools: ['read', 'write'],
  defaultModelId: 'anthropic/claude-sonnet-5',
};

const runtime = await createLocalRuntime({
  workspacePath: '/path/to/project',
  modes: [...customModes, myMode],
});
```

## 下一步实施

参考 `docs/tasks/runtime/runtime-implementation.md` 的"待完成"部分：

1. ✅ 创建 `src/local.ts` - 已完成
2. ✅ 创建 `src/mastra/modes.ts` - 已完成
3. ✅ 创建 `src/mastra/subagents/` - 已完成
4. ✅ 更新 `src/types.ts` - 已完成
5. ✅ 更新 `src/mastra/controller.ts` - 已完成
6. ✅ 更新 `src/index.ts` - 已完成
7. ✅ 创建 `examples/usage.ts` - 已完成
8. ✅ 更新 `README.md` - 已完成
9. ✅ 移除 HTTP Server 实现（`src/runtime.ts`, `src/server/`, `test/server.test.ts`）
10. ✅ 更新 `config.ts` 和 `test/runtime.test.ts`（标记为废弃）
11. 🚧 Desktop Provider IPC 和设置页已完成；Agent/Session IPC 待接入
12. ⏳ 实现 TUI 直接调用（`apps/tui`）
13. ⏳ 编写本地模式单元测试（`test/local.test.ts`）

## 相关文档

- [ADR-0001 本地模式架构决策](../../docs/adr/runtime/0001-local-mode-architecture.md)
- [运行时架构设计](../../docs/architecture/runtime/runtime-architecture.md)
- [自定义 Modes 和 Subagents](../../docs/design/runtime/custom-modes-and-agents.md)
- [后端包设计](../../docs/design/runtime/backend-packages.md)
- [实现任务清单](../../docs/tasks/runtime/runtime-implementation.md)

---

**更新时间**：2026-08-18  
**状态**：✅ 目录结构设计完成，包含模型、Provider、Modes 和 Subagents 支持
