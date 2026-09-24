# 变更日志

记录项目重要变更和里程碑。

## [Unreleased]

### 修复

- **Observational Memory 观察输入无上限，导致整轮 Run 被中止**: 修复报错
  `Observational memory observation run failed: This model's maximum context length is 1048576 tokens. However, you requested 1355938 tokens`。
  - **根因**: `@mastra/memory` 的主观察路径 `buildObserverHistoryMessage(messagesToObserve, { attachmentFilter })`
    未传 `maxPartLength`，**text / reasoning 片段完全不参与截断**（仅工具结果受 10k token 上限保护）；而
    thread 作用域没有任何输入上限（`maxTokensPerBatch` 只对 resource 作用域生效）。一旦未观察消息积压，
    单次观察请求即超出模型上下文窗口。该失败会经 `abortForOmFailure()` **中止整个 run**（无开关可关），
    且失败消息不会被标记为已观察，形成「积压 → 再失败」的死亡螺旋。
  - **修复**（依赖补丁 `patches/@mastra+memory+1.30.0.patch`）:
    1. 主观察路径补传 `maxPartLength` / `maxToolResultTokens`，复用 Mastra 自带的片段截断实现；
    2. `ObserverRunner.call()` 增加输入总量预算：按字符从最新往最旧累计，超出预算的更旧消息压缩为短头部
       而非丢弃 —— 保证任何消息都不会在「没被看到」的情况下被标记为已观察。
  - **阈值可覆盖**: `MINGYI_OM_MAX_PART_CHARS`（默认 20000）/ `MINGYI_OM_MAX_TOOL_RESULT_TOKENS`
    （默认 4000）/ `MINGYI_OM_TOTAL_CHARS`（默认 400000 字符）。
  - **实测效果**: 单条 540 万字符 → 2 万字符；120 条积压共 720 万字符 → 39.8 万字符；常规对话消息
    对象零改动。Runtime 测试 28 个文件 / 257 项全绿，Runtime 构建与 Desktop 类型检查通过，补丁可干净重放。

### 新增

- **自定义 Subagents 接入运行时，并在对话界面可见**: 此前 `packages/runtime/src/mastra/subagents/`
  下的 5 个专项 subagent（security-auditor / test-generator / perf-optimizer / refactor-assistant /
  doc-writer）**只导出、不生效**——Desktop 从未把 `subagents` 传给 `createLocalRuntime`，
  SDK 直接回落到内置三个。现以 `allSubagents`（内置 explore/plan/execute + 自定义 5）装配，
  对话侧新增 `SubagentToolUI` 卡片，并通过新增的 `runtime:subagent:list` IPC 把 `agentType`
  解析为可读名称。
  - SDK 的 `config.subagents` 是**整体替换**语义（`config?.subagents ?? [explore, plan, execute]`），
    合并必须在调用侧完成；内置三项经深路径 `@mastra/code-sdk/agents/subagents/*` 引入，升级
    code-sdk 时需复查该路径（`packages/runtime/test/subagents.test.ts` 会先行失败）。
  - ⚠️ 行为变更：显式传入 subagents 会使 SDK 跳过 `subagentModeMap` 的模型派生，内置三项改走
    工具侧 `fallbackModelId`（**当前** mode 的模型），不再固定为默认 mode 的模型。
  - 设计说明见 `docs/design/runtime/subagents-wiring.md`。
- **Pentest 多 Worker 调度与探索韧性（ADR-0005 决策 1 / 3 / 4）**: 消除单 worker 形态的三个缺陷。
  - **多 worker 池**（决策 1）: Driver 新增 `workers` 选项（每项含 `maxRunning` / `priority` /
    `retryAfter`）与 `markWorkerUnhealthy()`，选择顺序对齐 Cairn（优先级 → 运行数最少 →
    健康窗口过滤）。
  - **双阶段 explore**（决策 3）: 新增 `createPentestConcluder`，主阶段超时或结构化输出解析
    失败时保留 claim 与中间证据，进入收尾阶段落证，不再让整条探索链作废；收尾继承主阶段的
    executionMode 与 scope 校验，不构成权限升级。
  - **plan 态势去重**（决策 4）: 新增 `shouldSkipPlan()` 与 per-engagement 态势 checkpoint，
    仅 Fact 数增加、Hint 数增加或 open intents 由「存在」变「不存在」时才执行规划回调。
  - 协议写入者仍唯一：claim / evidence / fact 全部留在 Workflow 步骤内，worker 身份只作为
    work item 字段传入 explore 回调，权限边界不因并发而扩散。
  - 决策记录见 `docs/adr/runtime/0005-pentest-multi-worker-scheduling.md`（状态仍为 Proposed）；
    决策 2（不做 intent 能力标签）与决策 5（bootstrap 快路径）本次未做。
- **自定义 Provider 支持选择传输协议**: 新增 `protocol` 字段，可选 `openai-chat`（默认）/
  `openai-responses` / `anthropic`，用于接入 Anthropic Messages API 或 OpenAI Responses API 的自定义端点。
  Runtime（`RuntimeCustomProviderProtocol`）、设置页协议选择 UI、连接测试均已端到端实现；依赖补丁
  `patches/@mastra+code-sdk+1.7.2.patch` 补齐 `resolveLanguageModel()` 的分派环节 —— 上游 code-sdk
  1.7.2 及 1.7.3-alpha.0 均无此原生能力，自定义 provider 分支写死为 OpenAI 兼容 Chat Completions。
  - 已知限制: 「测试连接」尚未识别 `openai-responses`，仍按 `/chat/completions` 探测；仅暴露
    Responses API 的端点会出现「测试失败但实际推理正常」。

### 文档

- 新增 `docs/design/runtime/subagents-wiring.md`（subagent 装配语义、模型回落链、对话 UI 可见性），
  并在 `docs/design/runtime/README.md` 登记；同时修正 `custom-modes-and-agents.md` 中 subagent 工具
  参数名（实测为 `agentType`，非 `type`）与「已预留」的过期描述。
- 新增 `docs/adr/runtime/0004-observational-memory-input-budget.md`，记录 OM 观察输入预算的根因分析、
  方案对比与取舍，并补全 `docs/adr/runtime/README.md` 中缺失的 0002 / 0003 索引。
- 新增 `docs/adr/runtime/0005-pentest-multi-worker-scheduling.md`，记录多 Worker 调度与探索韧性的
  决策与备选方案对比。

### 配置

- **依赖升级至上游最新**: `@mastra/code-sdk` 1.5.3 → 1.7.2、`@mastra/core` 1.63.2 → 1.67.0、
  `@mastra/libsql` 1.22.2 → 1.23.0，并带动 `@mastra/memory` 1.28.1 → 1.30.0 等传递依赖共 15 个包对齐。
  code-sdk 对同族包精确锁版本，故三个直接依赖继续保持**精确版本声明**（不使用 `^`）。
  ⚠️ 该家族 `1.20.4` 为被投毒版本，升级时必须避开。
- 重建依赖补丁：`patches/@mastra+code-sdk+1.5.3.patch` → `patches/@mastra+code-sdk+1.7.2.patch`
  （补丁文件名绑定包版本，原补丁不可复用）。

## [0.1.0] - 2026-09-13

### 新增

- **安全工具**: 新增 `detect_sandbox_environment` 工具，支持自主感知系统 Docker CLI、Docker Daemon 服务状态以及 `mingyi-sandbox` 容器运行情况，未就绪时智能下发一键启动修复建议。
- **CI/CD 发布流水线**: 新增 `.github/workflows/release.yml`，支持通过网页手动一键触发多平台构建，自动化产出 macOS（arm64 / x64 DMG & ZIP）与 Windows amd64（x64 Setup & ZIP），并附带 SHA256 完整性校验自动发布至 GitHub Releases。
- **文档**: 新增 `docs/release-guide.md`（《Atlas 版本发布与贡献指南》），规范 SemVer 版本命名、网页端手动触发发版流程、各平台安全运行指引及社区开发者致谢机制。

### 变更

- **UI/UX 体验**: 对话区域工具调用展示由卡片式升级为现代轻量纯文字折叠（Disclosure）体验，与思考过程保持统一的极简视觉风格。
- **构建配置**: 规范 `electron-builder.yml` 产物命名与双平台（macOS arm64/x64、Windows amd64）架构输出参数。

## 格式说明

每个版本包含：

- **新增** - 新功能、新文件、新模块
- **变更** - API 变更、行为变更、重构
- **修复** - Bug 修复
- **文档** - 文档更新
- **配置** - 构建、依赖、工具链配置
- **移除** - 删除的功能或文件
- **安全** - 安全相关修复

日期格式：YYYY-MM-DD
