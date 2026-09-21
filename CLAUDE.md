# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

Mingyi 是一个基于 Electron 的本地 AI Agent 桌面应用，核心架构分为两层：

- **`packages/runtime/`**: 通用的本地 Agent 运行时层，封装 Mastra SDK 提供的 AgentController、Session、模型、工具、MCP 等能力
- **`apps/desktop/`**: Electron 桌面应用，通过 IPC 调用 Runtime 提供的服务

Runtime 是所有 apps 共用的 Harness 层，应用层不应复制引擎逻辑。

## 构建与开发命令

在仓库根目录运行 `npm install` 后，使用以下命令：

```bash
# 开发
npm run dev                              # 构建 Runtime 并启动 Electron 开发模式

# 构建
npm run build                            # 构建 Runtime 和 Desktop
npm run build -w @mingyi/runtime         # 仅构建 Runtime
npm run build -w mingyi-app              # 仅构建 Desktop

# 类型检查
npm run typecheck                        # 检查 Desktop
npm run typecheck -w @mingyi/runtime     # 检查 Runtime

# 测试
npm test                                 # 运行 Desktop Playwright 测试（无头）
npm run test:headed -w mingyi-app        # 运行 Desktop 测试（可见 UI）
npm run test -w @mingyi/runtime          # 运行 Runtime Vitest 单元测试
npm run test:watch -w @mingyi/runtime    # Watch 模式运行 Runtime 测试

# 代码质量
npm run lint                             # Lint Desktop 代码
npm run format -w mingyi-app             # 格式化 Desktop 代码
```

## 核心架构约束

### Runtime 依赖 Mastra SDK

Runtime 基于 `@mastra/code-sdk`、`@mastra/core` 构建。**禁止重复实现 SDK 已提供的能力**：

- Controller、Agent、Workflow、Session 管理
- Tool、Memory、模型路由、事件机制

开发前必须：
1. 搜索并阅读可用的 Mastra skill（本仓库已配置 `mastra` skill）
2. 确认 SDK 现有能力和推荐 API
3. 只有确认 SDK 不支持且项目确有需求时，才新增自有实现
4. 在 `docs/adr/` 记录原因与边界

### Runtime 初始化流程

Runtime 使用 `bootLocalAgentController()` 创建本地 Controller，不依赖 HTTP Server：

```typescript
// packages/runtime/src/local.ts
const boot = await bootLocalAgentController(controllerConfig)
const { controller, session, authStorage, mcpManager } = boot

// 基于 boot 结果创建各服务
const models = createRuntimeModelService({ controller, session })
const providers = createRuntimeProviderService({ controller, authStorage })
const sessions = createRuntimeSessionService({ controller, defaultSession: session })
```

### Desktop IPC 架构

Desktop 采用 Electron 的 Main-Renderer-Preload 三层架构：

- **Main Process** (`apps/desktop/src/main/`): 
  - `runtime-manager.ts` 管理 Runtime 实例生命周期
  - `runtime-service.ts` 注册 IPC handlers，桥接 Renderer 和 Runtime
  - `provider-service.ts` 处理 OAuth 流和 API Key 管理
  - `terminal-service.ts` 管理 node-pty 终端实例
  
- **Preload** (`apps/desktop/src/preload/`):
  - 通过 `contextBridge` 暴露类型安全的 API 给 Renderer
  - 定义在 `index.d.ts` 中的类型会被 Renderer 使用

- **Renderer** (`apps/desktop/src/renderer/`):
  - React 应用，通过 `window.api.*` 调用 Main Process
  - 主要组件：`chat/`（对话界面）、`hub/`（Skill Center）、`shell/`（终端面板）

### Runtime 服务层

Runtime 导出以下服务（见 `packages/runtime/src/index.ts`）：

- `models`: 模型配置和切换
- `providers`: Provider 和凭证管理（API Key、OAuth）
- `sessions`: Session 创建、消息发送、事件监听
- `skills`: Skill 搜索、调用
- `automations`: 定时任务和自动化
- `mcp`: MCP Server 管理
- `pentest`: 渗透测试引擎（Engagement、Driver、Verifier）
- `projects`: 工作空间项目管理
- `experts`: 自定义 Mode 管理
- `stateSearch`: 有界状态空间搜索

### Pentest 架构

渗透测试功能包含：

- **Store**: `FilePentestStore` 持久化 Engagement，`FilePentestEvidenceStore` 持久化证据
- **Driver**: `createRuntimePentestDriver()` 驱动测试流程，状态机包含 idle → running → paused/completed
- **Workflow**: `createPentestWorkflow()` 定义 Explore → Plan → Verify 三阶段
- **Verifier**: `RuntimePentestVerifierRegistry` 管理按漏洞类型分类的验证器
- **Tools**: 安全工具层（`src/tools/pentest/`），包含 HTTP probe、命令执行、破坏性操作分类器

数据目录默认为 `.mingyi/pentest/`，可通过 `MINGYI_PENTEST_DATA_DIR` 覆盖。

## 编码规范

- **语言**: TypeScript，缩进两个空格
- **格式化**: Prettier 配置为单引号、无分号、每行 100 列、无尾随逗号
- **命名**:
  - React 组件和导出类型：`PascalCase`
  - 函数和变量：`camelCase`
  - 文件名：`kebab-case`（如 `security-auditor.ts`）
- **导出**: Runtime 公开 API 必须在 `packages/runtime/src/index.ts` 显式维护
- **测试**: Playwright 测试用 `*.spec.ts`，Vitest 测试用 `*.test.ts`

## 目录结构

```
mingyi-tot/
├── apps/
│   └── desktop/           # Electron 应用
│       ├── src/main/      # 主进程（IPC、Runtime Manager）
│       ├── src/preload/   # Preload 桥接层
│       └── src/renderer/  # React UI
├── packages/
│   └── runtime/           # 通用 Runtime（Mastra 封装）
│       ├── src/
│       │   ├── models/    # 模型服务
│       │   ├── providers/ # Provider 服务
│       │   ├── sessions/  # Session 服务
│       │   ├── skills/    # Skill 服务
│       │   ├── pentest/   # 渗透测试引擎
│       │   ├── tools/     # 工具层（通用 + pentest）
│       │   ├── mastra/    # Mastra Controller 配置
│       │   └── index.ts   # 公开导出
│       └── test/          # Vitest 单元测试
├── docs/                  # 架构文档
│   ├── adr/runtime/       # Runtime ADR
│   ├── architecture/      # 架构设计
│   └── design/            # 功能设计
└── tests/                 # 调研和参考工程（不参与构建）
```

## 重要约定

1. **不要从 `apps/` 复制 Runtime 逻辑**：应用层只通过 Runtime 公开接口调用能力
2. **优先使用 Mastra SDK API**：开发前确认 SDK 能力，避免重复造轮子
3. **ADR 记录架构决策**：重要决策记录在 `docs/adr/runtime/`
4. **测试不依赖个人 API Key**：应 mock 模型和网络行为
5. **环境变量直接读进程环境**：应用不加载 `.env` 文件；新增变量需在本文件「环境变量」一节记录
6. **遵循 Conventional Commits**：如 `feat(runtime): add model switching` 或 `fix(desktop): restore terminal focus`

## 文档参考

- **架构约束**: `AGENTS.md`（中文项目指南）
- **ADR**: `docs/adr/runtime/` 记录关键决策
  - `0001-local-mode-architecture.md`: 本地模式（IPC）架构
  - `0002-bounded-state-space-search.md`: 状态空间搜索服务
  - `0003-generic-tool-layer.md`: 通用工具层设计
- **Mastra 集成**: `docs/integrations/mastra/`

## 环境变量

通过进程环境设置（应用不读取 `.env` 文件；应用级数据布局见 `apps/desktop/src/main/index.ts` 的 `~/.atlas` 说明）：

- `MINGYI_RUNTIME`: 运行时模式（`fake` 为确定性本地模式，`pi` 为真实 Agent 模式）
- `MINGYI_WORKSPACE_ROOT`: 工作空间根路径
- `MINGYI_PENTEST_DATA_DIR`: Pentest 数据持久化目录
- `MINGYI_PROJECTS_DATA_DIR`: 项目空间数据目录
- `MINGYI_DISABLE_UPDATE_CHECK`: 设为 `1`/`true` 时关停客户端更新检查（含启动自动检查），e2e 默认注入以保证断言不依赖外网
- Provider 相关: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `MINGYI_BASE_URL` 等

## 调试提示

- **Runtime 日志**: Runtime 服务通过 `console.log/error` 输出到 Main Process 控制台
- **Renderer DevTools**: Electron 开发模式下自动打开 Chrome DevTools
- **IPC 通信**: 在 `apps/desktop/src/shared/*-ipc.ts` 中定义 IPC 通道常量
- **Session 事件**: 通过 `sessions.on()` 监听 Runtime 事件（消息、工具调用、完成等）
