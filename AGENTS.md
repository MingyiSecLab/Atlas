# 仓库指南

## 项目结构与模块组织

本仓库是 Mingyi 的开源 npm workspace。`apps/desktop/` 是 Electron、React 和 TypeScript 应用：Electron 主进程代码放在 `src/main/`，preload API 放在 `src/preload/`，浏览器 UI 放在 `src/renderer/`。`packages/runtime/` 是开源的本地 Agent 核心，模型服务位于 `src/models/`，Controller、Mode 和 Subagent 定义位于 `src/mastra/`。面向授权安全评估的安全工具统一放在 `src/tools/security-tools/`（新工具在该目录追加文件并经 `index.ts` 汇总导出），实现 pentest 的 `RuntimePentestTool` 契约后经 pentest 域的 `DEFAULT_PENTEST_TOOLS` 注册调度；通用工具机制位于 `src/tools/runtime-tools/`，目录布局由 `packages/runtime/test/tool-layout.test.ts` 守护。根 workspace 只维护 Runtime 和 Desktop；根目录下未列入 workspace 的独立项目目录不参与本项目的构建、测试或发布。Runtime 单元测试位于 `packages/runtime/test/`，Desktop 端到端测试位于 `apps/desktop/tests/`。除非任务明确指定，否则顶层 `tests/` 视为调研和参考工程。架构决策与实现说明放在 `docs/`。

## Runtime 架构约束

`packages/runtime/` 是所有 `apps/` 共用的通用 Harness 层，负责封装本地 Mastra Code 的 AgentController、Session、模型、Mode、Subagent、Tool、Provider、MCP 和生命周期能力。Desktop、TUI 等应用层只通过 Runtime 的稳定公开接口调用这些通用能力，不要在 `apps/` 中复制引擎逻辑。

Runtime 基于 Mastra SDK 构建，核心依赖为 `@mastra/code-sdk`、`@mastra/core` 和 `@mastra/core/agent-controller`。开发 Runtime 时禁止重复实现 SDK 已提供的 Controller、Agent、Workflow、Tool、Memory、模型路由或事件机制；应先确认官方 API，再通过适配、组合或薄封装扩展。只有确认 SDK 不支持且项目确有需求时，才新增自有实现，并在 `docs/adr/` 记录原因与边界。

用户要求开发或扩展功能时，开始编码前必须先搜索并阅读可用的 Mastra skill，确认 Mastra 现有能力、推荐 API 和版本约束。若 skill 与本地安装版本不一致，以当前依赖的类型定义和源码为准，并记录兼容处理。

## 独立项目边界

`ptcore/` 是暂存在本仓库中的独立项目，仅为早期协作提供目录位置。它不是根 workspace
成员，不属于开源 Runtime 的构建、测试、发布或依赖图；不要从 `apps/`、`packages/runtime/` 或根
文档引用其源码和内部 API。PTCore 的代码、文档、依赖、测试、构建和发布约束以
`ptcore/AGENTS.md` 为准，迁移私有 Git 仓库时应整体移动 `ptcore/` 目录。

## 构建、测试与开发命令

执行以下命令前，先在仓库根目录运行 `npm install`。

- `npm run dev` 通过 electron-vite 启动 Electron 应用。
- `npm run build` 执行类型检查并构建 Desktop 应用。
- `npm run typecheck` 检查 Desktop 主进程、preload 和 renderer 的 TypeScript。
- `npm run lint` 在 Desktop workspace 中运行 ESLint。
- `npm test` 无头运行 Desktop Playwright 测试。
- `npm run test:headed -w mingyi-app` 以可见 UI 运行 Playwright。
- `npm run test -w @mingyi/runtime` 运行 Runtime Vitest 测试。
- `npm run build -w @mingyi/runtime` 将 Runtime 编译到 `dist/`。

## 编码风格与命名约定

生产代码使用 TypeScript，缩进为两个空格。Prettier 配置为单引号、不使用分号、每行最多 100 列且不使用尾随逗号；修改 Desktop 后运行 `npm run format -w mingyi-app`。遵循 ESLint 的 TypeScript、React、Hooks 和 refresh 规则。React 组件及导出类型使用 `PascalCase`，函数和变量使用 `camelCase`，文件名使用 kebab-case，例如 `security-auditor.ts`。Runtime 的公开导出应在 `packages/runtime/src/index.ts` 中显式维护。

## 测试指南

Playwright 测试文件使用 `*.spec.ts`，Vitest 测试文件使用 `*.test.ts`。将针对性测试放在所属 workspace 的测试目录中。适合时应 mock 模型和网络行为，测试不得依赖个人 API Key。提交前运行受影响 workspace 的测试、类型检查和 lint。目前未强制要求具体的覆盖率阈值。

## 提交与 Pull Request 指南

仓库目前还没有提交历史。请使用简洁的 Conventional Commits 格式，例如 `feat(runtime): add provider model resolution` 或 `fix(desktop): restore terminal focus`。Pull Request 应说明行为变化和架构影响，关联对应 issue 或任务，列出验证命令；涉及 renderer 的变更需附截图。禁止提交密钥；新增环境变量需在 `CLAUDE.md` 的「环境变量」一节记录（应用不加载 `.env` 文件）。
