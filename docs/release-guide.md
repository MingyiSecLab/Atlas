# Atlas 版本发布与贡献指南

本文档详细说明 **Atlas**（[MingyiSecLab/Atlas](https://github.com/MingyiSecLab/Atlas)）的版本发布机制、GitHub Actions 自动化多平台构建、安装包安全指引以及社区开发者贡献规范。

---

## 1. 软件发布概览

Atlas 正式构建产物均托管并发布在 GitHub Releases：
👉 **官方发布地址**：[https://github.com/MingyiSecLab/Atlas/releases](https://github.com/MingyiSecLab/Atlas/releases)

### 跨平台构建支持

| 操作系统 | 目标架构 | 构建产物文件 | 说明 |
| :--- | :--- | :--- | :--- |
| **macOS** | **Apple Silicon (arm64)** | `Atlas-<version>-mac-arm64.dmg`<br>`Atlas-<version>-mac-arm64.zip` | 适用于配备 M1/M2/M3/M4 系列芯片的 Mac |
| **macOS** | **Intel (x64)** | `Atlas-<version>-mac-x64.dmg`<br>`Atlas-<version>-mac-x64.zip` | 适用于搭载 Intel 处理器的旧款 Mac |
| **Windows** | **amd64 (x64)** | `Atlas-<version>-win-x64-setup.exe` | 64 位 Windows 标准安装向导（支持自定义目录与桌面快捷方式） |
| **Windows** | **amd64 (x64)** | `Atlas-<version>-win-x64.zip` | 免安装绿色便携版，解压即用 |
| **全平台** | - | `SHA256SUMS.txt` | 包含所有构建产物的 SHA-256 哈希值，用于防篡改校验 |

---

## 2. 版本号规范 (Semantic Versioning)

Atlas 遵循 [SemVer 2.0.0](https://semver.org/lang/zh-CN/) 语义化版本命名规范：

`v<主版本号 MAJOR>.<次版本号 MINOR>.<修订号 PATCH>[-预发布标识 PRERELEASE]`

- **主版本号 (MAJOR)**：涉及颠覆性架构改造、不向后兼容的重大协议或交互破坏性变更（如 `v1.0.0`）。
- **次版本号 (MINOR)**：新增重要业务能力、增加新模式/新安全工具、向下兼容的功能迭代（如 `v0.2.0`）。
- **修订号 (PATCH)**：向下兼容的问题修复、安全热补丁、轻微 UI 细节修正（如 `v0.1.1`）。
- **预发布版本**：如 `v0.2.0-beta.1`、`v0.2.0-rc.1`。

### 版本号的单一来源与自动注入

`apps/desktop/package.json` 的 `version` 字段是**唯一版本源**，发布时无需手工改界面文案：

| 版本出现位置 | 来源 |
| :--- | :--- |
| 安装包文件名（`Atlas-<version>-*.dmg` 等） | electron-builder 读取上述字段 |
| 应用内显示（侧边栏底部 / 设置导航底部） | electron-vite 构建时以 `__APP_VERSION__` 注入渲染层 |
| Release tag | 发布时在 Workflow Dispatch 表单填写 |

Release 流水线的 **preflight 门禁**会用 [`.github/scripts/validate-release-tag.mjs`](../.github/scripts/validate-release-tag.mjs) 校验 tag 与该字段一致，不一致直接拒绝打包，避免"tag 是 v0.2.0、安装包却叫 1.0.0"的三方漂移。发版流程因此是：改 `apps/desktop/package.json` 的 `version` → 提交 → 触发流水线并填入同版本 tag。构建机的提交短 SHA 也会一并注入（`__BUILD_COMMIT__`），悬停在侧边栏版本号上即可看到。

---

## 3. GitHub Actions 自动化发布流水线

本仓库已配置自动化发布流水线 [`.github/workflows/release.yml`](../.github/workflows/release.yml)，采用**纯手动触发（Workflow Dispatch）**机制。

### 为什么采用手动触发？
1. **防止 Actions 额度浪费**：Electron 桌面端打包需要 macOS 与 Windows 矩阵虚拟机，计费系数高。手动触发可彻底避免打错 tag 或本地测试 push tag 带来的误触发。
2. **便于人工质量把关**：维护者可在发版前完整跑通全套测试，确认一切无误后再去网页上一键触发打包；支持先构建为【草稿 (Draft)】，亲自在真实电脑上试用安装包后，再一键正式发布。
3. **支持灵活指定分支与版本**：无需提前在本地打 tag，网页端输入即可自动创建 tag 并发布。

### 触发步骤

1. 登录 GitHub 并进入项目仓库 [MingyiSecLab/Atlas](https://github.com/MingyiSecLab/Atlas)；
2. 点击顶部的 **Actions** 选项卡；
3. 在左侧工作流列表中选择 **Release**；
4. 点击右侧的 **Run workflow** 按钮，在弹出的表单中填写：
   - **Use workflow from**：选择要打包的分支（默认 `main`）；
   - **Release Tag 版本号**：输入版本标签（如 `v0.1.0`）；
   - **Release 标题**：可选（留空默认为 `Atlas <Tag>`）；
   - **发布为草稿 Draft**：可选（勾选后先生成草稿，可下载测试无误后再点击 Publish）；
   - **标记为预发布测试版 (Pre-release)**：可选（适合发布 Beta/RC 版）；
5. 点击绿色的 **Run workflow** 按钮启动构建。

流水线分三段执行，核心原则是**先便宜后昂贵**——任何编译不过的提交都必须在启动高计费的
macOS / Windows 矩阵机之前被拦下：

| 阶段 | Runner | 超时 | 职责 |
| :--- | :--- | :--- | :--- |
| **1. Preflight** | `ubuntu-latest` | 20 min | `npm ci` → 编译 `@mingyi/runtime` → Desktop 类型检查 → 运行不依赖 Electron 的纯逻辑用例。**门禁**：不通过则终止流水线，不消耗 mac/win 额度。 |
| **2. Build** | `macos-latest` / `windows-latest`（并行） | 75 / 60 min | 并行编译 `@mingyi/runtime` 与 `mingyi-app`，再用 electron-builder 打包：macOS 产出 arm64 + x64 的 DMG 与 ZIP，Windows 产出 amd64 的 EXE 与 ZIP。 |
| **3. Publish** | `ubuntu-latest` | 20 min | 汇总所有产物 → 生成全局 `SHA256SUMS.txt` → 创建 GitHub Release 并附带公告与附件。 |

流水线的性能与稳定性设计：

- **二进制缓存**：缓存 Electron 发行包（`~/Library/Caches/electron` / `%LOCALAPPDATA%\electron\Cache`）
  与 electron-builder 工具链（winCodeSign、nsis、dmg 等），键值绑定 `package-lock.json` 哈希。
  缓存命中后无需重复下载，冷启动与热启动差异明显。
- **锁定式安装**：使用 `npm ci` 严格按 `package-lock.json` 安装，保证发布产物与本地验证一致。
- **互斥与超时**：发布流水线全局串行（同一时刻只允许一次 Release 运行，且不静默取消进行中的
  发布）；每个 job 均设有 `timeout-minutes`，避免渲染层构建卡死时持续占用高系数额度。
- **产物校验**：安装包收集阶段只匹配 `.dmg` / `.zip` / `.exe` 等最终产物（自动排除
  `*.blockmap`、`builder-*.yml` 等中间文件），并在无产物时直接失败；发布阶段要求附件非空，
  避免产生一个没有安装包的 Release。
- **macOS 双架构不拆分 job**：arm64 与 x64 在同一次 electron-builder 调用内串行产出。渲染层
  打包是主要耗时，若拆成两个 job 会把它完整跑两遍，计费分钟数接近翻倍，只换来墙钟时间的少量
  缩短，不划算。

> [!TIP]
> macOS 与 Windows 使用各自的窗口外壳：macOS 走 `hiddenInset` 保留原生红绿灯，Windows 走
> 无边框 + `titleBarOverlay`。两者由运行时按平台自动切换，因此**无需**为平台分别构建不同产物。

---

## 4. 各平台安装与系统权限指引

### macOS 首次运行提示
由于开源社区分发的安装包未购买 Apple 商业开发者签名，macOS Gatekeeper 可能会提示：
> *“无法打开‘Atlas’，因为无法验证开发者”* 或 *“已损坏，无法打开”*

**解决方法（任选其一）**：
- **方式 A（图形界面操作）**：
  1. 打开 macOS【系统设置】->【隐私与安全性】；
  2. 滑动到下方【安全性】区域；
  3. 看到 *“已阻止使用 Atlas，因为来自身份不明的开发者”*，点击其右侧的 **【仍要打开】** 按钮即可。
- **方式 B（终端一行命令）**：
  打开终端运行：
  ```bash
  sudo xattr -rd com.apple.quarantine /Applications/Atlas.app
  ```

### Windows 首次运行提示
Windows SmartScreen 可能会弹出：
> *“Windows 已保护你的电脑（未知发布者）”*

**解决方法**：
点击提示框中的 **【更多信息】** 链接，然后点击出现的 **【仍要运行】** 按钮即可正常进入安装。

### 应用数据目录说明（~/.atlas）

Atlas 的应用级数据统一存放在用户主目录的 `~/.atlas`（Windows 为 `%USERPROFILE%\.atlas`），跨平台布局一致，无需任何环境变量配置：

| 路径 | 用途 |
| :--- | :--- |
| `atlas.db` | SQLite 主库：任务、会话历史、消息流、状态机 |
| `vectors.db` | 向量数据库：嵌入式代码/文档检索与记忆索引 |
| `observability.duckdb` | 追踪数据库：Agent 执行链路与工具调用 Trace |
| `settings.json` | 全局设置（模型默认值、自定义 Provider 等） |
| `auth.json` | Provider 凭证（API Key / OAuth，与配置分离存放） |
| `agents/` | 用户级通用专家人设（`*.md`） |
| `projects/projects.json` | 项目工作区登记 |
| `blobs/evidence/`、`blobs/terminal/` | 大文件分流：渗透原始证据与终端大日志 |
| `pentest/` | 渗透测试 engagement 快照与状态机 |

说明：

- **项目级配置不入 `~/.atlas`**：工作区内的 `.mastracode/`（项目级专家、settings）跟随工作区目录，便于随仓库协作共享。
- **专家合并规则**：`~/.atlas/agents/` 与工作区 `<workspace>/.mastracode/agents/` 同时生效，同名 slug 时工作区优先。
- **从早期版本升级**：旧数据位于 `~/Library/Application Support/mastracode/`（含 `mastra.db`、`auth.json`）与 `~/Library/Application Support/mingyi-app/projects/`，可手动拷贝迁移（macOS 示例）：
  ```bash
  mkdir -p ~/.atlas
  cp ~/Library/Application\ Support/mastracode/{mastra.db,mastra-vectors.db,auth.json} ~/.atlas/
  cp -R ~/Library/Application\ Support/mingyi-app/projects ~/.atlas/projects
  ```
  不迁移则首次启动视为全新环境（需重新登录 Provider，历史对话不可见）。
- **数据重置**：退出应用后删除 `~/.atlas` 即重置全部应用数据（等价于卸载重装）；工作区数据不受影响。

### 文件完整性校验
建议在运行前校验安装包的 SHA-256 指纹：
- **macOS / Linux**：
  ```bash
  shasum -a 256 Atlas-*-mac-arm64.dmg
  ```
- **Windows (PowerShell)**：
  ```powershell
  Get-FileHash .\Atlas-*-win-x64-setup.exe -Algorithm SHA256
  ```
将输出的 Hash 与 Releases 页面附件 `SHA256SUMS.txt` 比对一致即可确认未被篡改。

---

## 5. 社区版本贡献指南

我们非常欢迎来自全球安全研究员与开发者的贡献！为保障项目质量，请遵循以下规范：

### 贡献流程

```
Fork 仓库 ──> 创建特性分支 ──> 遵循规范编码 ──> 本地运行测试/Lint ──> 提交 PR ──> 代码审查合并 ──> 登入 Release 贡献榜
```

1. **Fork 与分支**：
   - 从 `main` 分支切出具名分支，如 `feat/docker-sandbox-detection` 或 `fix/task-write-fallback`。
2. **提交信息规范 (Conventional Commits)**：
   提交信息需简明扼要，推荐前缀：
   - `feat(...)`: 新特性（如 `feat(runtime): add docker sandbox detection tool`）
   - `fix(...)`: Bug 修复（如 `fix(desktop): fix tool disclosure text wrap`）
   - `docs(...)`: 文档更新
   - `refactor(...)`: 代码重构（不改变外部行为）
   - `test(...)`: 补充或修正测试用例
3. **提交前本地验证**：
   在提交 PR 之前，请确保本地通过全部质量把关命令：
   ```bash
   npm run typecheck       # 检查 TypeScript 类型
   npm run lint            # 运行代码规范检查
   npm test -w @mingyi/runtime  # 运行 Runtime 单元测试
   npm run build           # 验证桌面端与内核构建
   ```
4. **致谢机制与贡献者名单**：
   - 凡贡献被合并的代码，均会自动列入 GitHub Release 的贡献者鸣谢名单；
   - 核心贡献者、重大安全工具贡献者将同步收录至桌面端【致谢设置】（`Settings -> Acknowledgements`）面板展示。

---

## 6. 标准 Release Notes 说明模版

发布新版本时，建议在 GitHub Release Body 采用以下标准模版：

```markdown
## 🚀 Atlas v0.1.0 正式发布

Atlas（Mingyi 开源智能安全评估平台）迎来全新里程碑版本！本版本带来了完备的多模式安全评估引擎、基于 Mastra 的本地 Agent 运行时以及 Kali 沙箱环境深度集成。

### 🌟 核心亮点与新特性
- **沙箱环境自主感知工具 (`detect_sandbox_environment`)**：大模型可在发起高级渗透前自主检查 Docker 与 mingyi-sandbox 容器运行状态，智能指导用户启动或排障。
- **对话界面纯文字折叠优化**：工具调用与思考过程采用统一的极简 Disclosure 文字展开样式，告别冗余卡片，操作体验全面看齐顶级 AI 助手。
- **渗透测试拓扑与发现闭环**：支持与右侧渗透视图深度协同，漏洞 PoC 与危害级别自动上报。

### 🛠️ 变更与修复详情
- `feat(runtime)`: 适配安全工具适配层，支持持久化会话与环境诊断；
- `fix(runtime)`: 优化任务清单工具容错降级机制；
- `style(desktop)`: 对话区工具调用样式轻量化改造。

### 📦 安装包下载与校验 (SHA-256)
- **macOS (Apple Silicon)**: `Atlas-0.1.0-mac-arm64.dmg`
- **macOS (Intel)**: `Atlas-0.1.0-mac-x64.dmg`
- **Windows (amd64)**: `Atlas-0.1.0-win-x64-setup.exe`
- **Windows 便携版**: `Atlas-0.1.0-win-x64.zip`
- **完整哈希对照表**: 见附件 `SHA256SUMS.txt`

### 👏 贡献者致谢
感谢本版本的所有贡献者与安全研究员！
- @m7rick (项目发起人 & 主要维护者)
- @MingyiSecLab
```
