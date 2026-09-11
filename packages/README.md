# Shared Packages

本目录存放供多个应用共同使用的开源业务包。当前结构设计见
[`../docs/design/runtime/backend-packages.md`](../docs/design/runtime/backend-packages.md)。

| 目录 | 职责 | 运行环境 |
| --- | --- | --- |
| [`runtime/`](runtime/README.md) | Mastra Code 本地 Runtime 的组合、配置和生命周期 | Node.js only |

当前不建立单独的 `server`、`contracts` 或 `client` 包。UI 直接使用 `@mastra/client-js` 的 AgentController 客户端；Electron 独有能力的 IPC 类型由 Desktop 应用在自身边界内维护。
禁止建立含义模糊的 `shared` 或 `utils` 包。只有被至少两个应用共同使用并具有明确所有权的开源代码才进入本目录。
