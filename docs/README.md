# 项目文档

本目录是项目设计与交付信息的唯一文档入口。代码描述当前实现，文档补充产品边界、架构约束、决策原因和实施计划。

## 目录

| 目录 | 职责 |
| --- | --- |
| [`product/`](product/README.md) | 产品定位、范围、非目标和里程碑 |
| [`architecture/`](architecture/README.md) | 当前有效的系统架构、模块边界和运行模型 |
| [`adr/`](adr/README.md) | 重要且难以逆转的架构决策及其原因 |
| [`design/`](design/README.md) | 功能或子系统进入开发前的技术设计 |
| [`plans/`](plans/README.md) | 可执行的开发计划、任务拆分和验收条件 |
| [`tasks/`](tasks/README.md) | 实施任务跟踪、进度和待办事项 |
| [`runbooks/`](runbooks/README.md) | 本地开发、构建、发布和故障处理步骤 |
| [`integrations/`](integrations/README.md) | 外部 SDK、协议和基础设施的适配说明 |

## 文档关系

1. `product/` 定义要解决的问题和范围。
2. `architecture/` 描述当前系统如何工作。
3. `adr/` 解释关键架构选择为什么成立。
4. `design/` 描述一个具体变更准备如何实现。
5. `plans/` 将已确认的设计拆成可执行任务。
6. `tasks/` 跟踪实施进度、已完成和待办事项。
7. `runbooks/` 记录可重复执行的工程操作。
8. `integrations/` 记录外部依赖的真实能力、版本和适配边界。

不要在多份文档中复制同一结论。需要引用时使用相对链接，并明确哪一份文档是事实来源。

## 通用约定

- 文件名使用英文 `kebab-case`，正文默认使用中文。
- 文档内路径必须相对于仓库或当前文档，避免记录本机绝对路径。
- 文档描述与代码不一致时，应在同一次变更中修正文档。
- 临时调查笔记不进入本目录；形成稳定结论后再整理为设计、ADR 或运行手册。
- 每个分类目录的根目录只保留 `README.md` 作为索引和规范入口。
- 项目文档必须放在分类目录下的项目子目录中，例如 `design/runtime/` 和
  `tasks/runtime/`。独立项目的文档应随项目目录维护，不纳入本目录索引。
- 跨项目或尚未归属项目的约定写在分类 `README.md`；通用模板放在 `_templates/` 等
  明确标记的保留目录中，不与项目文档混放。

## 项目索引

| 项目 | 架构 | 设计 | ADR | 计划 | 任务 | 运行手册 | 外部集成 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `runtime` | [`architecture/runtime/`](architecture/runtime/) | [`design/runtime/`](design/runtime/) | [`adr/runtime/`](adr/runtime/) | - | [`tasks/runtime/`](tasks/runtime/) | - | [`integrations/mastra/`](integrations/mastra/) |
| `desktop` | - | [`design/desktop/`](design/desktop/) | - | - | - | - | [`integrations/mastra/`](integrations/mastra/) |
