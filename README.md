# Atlas (Mingyi)

Mingyi 是一个基于 Electron 的本地 AI Agent 桌面应用：把 Mastra Code 的 AgentController、模型、模式、工具、MCP 与会话能力封装成本地 Runtime，再通过 IPC 提供给桌面 UI。支持任务与空间（项目目录）的分组管理、多模型切换、技能与专家调用、内置终端以及面向授权安全评估的渗透测试（Pentest）工作流。

## 截图

| 主界面 | 任务菜单 |
| --- | --- |
| ![主界面](docs/screenshots/home.png) | ![任务菜单](docs/screenshots/task-menu.png) |
| **侧栏任务与空间** | **终端面板** |
| ![侧栏任务与空间](docs/screenshots/sidebar.png) | ![终端面板](docs/screenshots/terminal.png) |
| **模型服务配置** | **Pentest 工作流** |
| ![模型服务配置](docs/screenshots/providers.png) | ![Pentest 工作流](docs/screenshots/pentest.png) |

## 仓库结构

```
.
├── apps/desktop        # Electron 桌面应用（主进程 / preload / renderer）
├── packages/runtime    # 通用本地 Agent Runtime（开源核心）
├── docs                # 架构文档与 ADR（开发阶段不公开）
└── patches             # 依赖补丁
```

- `packages/runtime/`：基于 `@mastra/code-sdk` 封装的本地 Runtime，提供 AgentController、Session、模型路由、模式（Mode）、Subagent、工具、MCP、技能、自动化与 Pentest 域能力；Desktop 与 TUI 等应用层只通过 Runtime 的稳定公开接口调用。
- `apps/desktop/`：Electron 应用，主进程代码在 `src/main/`，preload API 在 `src/preload/`，浏览器 UI 在 `src/renderer/`。

## 快速开始

先在仓库根目录安装依赖：

```bash
npm install
```

常用命令：

```bash
# 启动 Electron 应用（开发模式）
npm run dev

# 构建与类型检查
npm run build
npm run typecheck

# 测试
npm test                          # Desktop Playwright E2E（无头）
npm run test -w @mingyi/runtime   # Runtime Vitest 单测

# Lint 与格式化
npm run lint
```

要求 Node.js >= 22.19。

## Runtime 使用示例

```typescript
import { createLocalRuntime } from '@mingyi/runtime'

const runtime = await createLocalRuntime({
  workspacePath: '/path/to/project',
})

// Desktop 通过 IPC 暴露 runtime.sessions 的可序列化接口；
// TUI 等简单场景可直接使用 runtime.session
await runtime.sessions.create({ title: '新任务' })
await runtime.sessions.sendMessage({ sessionId, content: '你好' })

await runtime.shutdown()
```

## 许可证

待定（发布前补充）。
