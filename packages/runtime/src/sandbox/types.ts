/**
 * Kali 沙箱执行 SPI（见 container/README.md 与 docs 设计讨论）。
 *
 * 架构定位：桌面端 Runtime 是唯一大脑（模型推理、Facts/Intents 状态空间、调度），
 * 沙箱容器是纯执行环境 —— 常驻进程（`tail -f /dev/null`），只接受受控下发的命令。
 * 本模块不做任何授权判断：调用方（pentest 工具层）必须先过 scope 匹配与
 * 破坏性操作分类，才能到达这里；Adapter 只负责"忠实地执行并返回输出"。
 */

/** 前台命令执行选项。 */
export interface SandboxExecOptions {
  /** 外层超时毫秒数；超时后终止命令，`timedOut=true`。默认取 adapter 配置。 */
  timeoutMs?: number
  /** 容器内工作目录，默认为沙箱 workspace。 */
  cwd?: string
  /** 附加环境变量（合并到容器默认 env 之上）。 */
  env?: Record<string, string>
}

/** 前台命令执行结果。 */
export interface SandboxExecResult {
  stdout: string
  stderr: string
  /** 进程退出码；被超时杀死或未能启动时为 null。 */
  exitCode: number | null
  timedOut: boolean
  /** 输出超过上限被截断时为 true（上限见 adapter 配置）。 */
  truncated: boolean
  durationMs: number
}

/** 后台会话（容器内 tmux 承载）：监听器、反弹 shell 接收器、交互式利用。 */
export interface SandboxSessionInfo {
  /** 会话标识，同时是容器内 tmux session 名（约束：不含 `:` 与 `.`）。 */
  id: string
  command: string
  createdAt: number
}

/** 会话增量读取结果。 */
export interface SandboxSessionChunk {
  sessionId: string
  /** 距上次读取以来的新增输出（基于 tmux capture-pane 历史的差集）。 */
  output: string
  /** 会话进程是否仍在运行。 */
  alive: boolean
}

export type SandboxState = 'creating' | 'running' | 'stopped' | 'missing'

export interface SandboxStatus {
  state: SandboxState
  /** Docker 容器 id（短格式），未创建时为空。 */
  containerId?: string
  image: string
}

/**
 * 沙箱执行器 SPI。
 *
 * 实现约定：
 * - `exec` 为前台阻塞语义，输出超上限截断但不失败；
 * - 持久会话必须能在多次 `sessionRead` 之间保持进程存活，且读取是增量的；
 * - 所有方法可重入；容器不存在时 `exec`/会话操作应先触发 `ensure()` 语义或抛出明确错误；
 * - `dispose` 幂等，停止容器但不删除工作卷（保留现场）。
 */
export interface RuntimeSandboxAdapter {
  readonly id: string
  status(): Promise<SandboxStatus>
  /** 确保容器已启动（已存在则复用，未创建则拉起）。 */
  ensure(): Promise<void>
  exec(command: string, options?: SandboxExecOptions): Promise<SandboxExecResult>
  /** 创建后台会话；同名会话已存在时幂等返回既有信息。 */
  openSession(input: { id: string; command: string }): Promise<SandboxSessionInfo>
  /** 向交互式会话发送一行输入（自动补回车）。 */
  sessionSend(sessionId: string, input: string): Promise<void>
  /** 读取会话新增输出；会话不存在时抛错。 */
  sessionRead(sessionId: string): Promise<SandboxSessionChunk>
  closeSession(sessionId: string): Promise<void>
  listSessions(): Promise<readonly SandboxSessionInfo[]>
  /** 读取容器内文本文件（受大小上限约束）。 */
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  dispose(): Promise<void>
}

/** Docker 沙箱配置。 */
export interface DockerSandboxConfig {
  /** 沙箱镜像，默认 `mingyi-sandbox:latest`。 */
  image?: string
  /** 容器名；建议按 engagement 命名（如 `mingyi-sandbox-eng-001`）以便隔离与追溯。 */
  containerName: string
  /** 网络模式，默认 `host`（直连宿主网络与可达内网/靶场）。 */
  networkMode?: string
  /**
   * 容器能力追加项，默认 `['NET_RAW', 'NET_ADMIN']`。
   * 渗透工具（nmap 等带 file capabilities 的二进制）在 rootless 运行时
   * （OrbStack/Docker Desktop）里必须具备这两项才能 exec 与原始套接字扫描。
   */
  capAdd?: readonly string[]
  /** 容器内工作目录，默认 `/home/kali/workspace`。 */
  workspaceDir?: string
  /** 宿主机工作区挂载目录；设置后启动容器时通过 -v hostWorkspaceDir:workspaceDir 挂载。 */
  hostWorkspaceDir?: string
  /** docker 可执行文件，默认 `docker`；也可指向 DOCKER_HOST 对应的 CLI。 */
  dockerBin?: string
  /** exec 默认超时毫秒数，默认 120_000。 */
  execTimeoutMs?: number
  /** 单流输出上限字节，超出截断并标记 truncated，默认 262_144（256 KiB）。 */
  maxOutputBytes?: number
}

export const DEFAULT_SANDBOX_IMAGE = 'mingyi-sandbox:latest'
export const DEFAULT_SANDBOX_WORKSPACE = '/home/kali/workspace'
