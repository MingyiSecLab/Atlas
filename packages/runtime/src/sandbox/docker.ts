/**
 * 基于 docker CLI 的沙箱适配器实现。
 *
 * 刻意不引入 dockerode 等新依赖：Runtime 依赖面保持最小（见 package.json），
 * 通过 `node:child_process` 调用宿主 `docker`，与 container/README.md 的
 * "常驻容器 + docker exec 受控下发" 用法一致。
 *
 * 进程执行器以 `runner` 注入（默认 spawn 实现），单元测试可用脚本化 fake
 * 替换，无需真实 Docker —— 与仓库"测试不依赖个人 API Key 与外部服务"的约定一致。
 */

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_SANDBOX_IMAGE,
  DEFAULT_SANDBOX_WORKSPACE,
  type DockerSandboxConfig,
  type RuntimeSandboxAdapter,
  type SandboxExecOptions,
  type SandboxExecResult,
  type SandboxSessionChunk,
  type SandboxSessionInfo,
  type SandboxState,
  type SandboxStatus
} from './types.js'

/** 底层 docker 命令执行结果（不做截断，截断由适配器层统一处理）。 */
export interface SandboxProcessResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
}

/** 可注入的 docker CLI 执行器；args 为 `docker` 之后的参数列表。 */
export type SandboxDockerRunner = (
  args: readonly string[],
  options?: { timeoutMs?: number; stdin?: string }
) => Promise<SandboxProcessResult>

/** 适配器可注入项：runner 之外均为纯配置。 */
export interface DockerSandboxOptions extends DockerSandboxConfig {
  runner?: SandboxDockerRunner
}

/** 空闲控制类命令（inspect/start/run）的看门狗超时。 */
const CONTROL_TIMEOUT_MS = 30_000
/** 会话操作命令的看门狗超时。 */
const SESSION_TIMEOUT_MS = 15_000
/** exec 宿主侧兜底超时的额外余量（容器内 timeout 为主，宿主只兜底）。 */
const EXEC_BACKSTOP_GRACE_MS = 5_000

/**
 * 单引号 POSIX shell 转义：`it's` → `'it'"'"'s'` 形态（这里用 `'\''` 拼接）。
 * 供嵌入 bash -lc 脚本的参数使用。
 */
export function shquote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/** tmux 会话名约束：不含 `:`、`.` 与空白（否则 tmux 拒绝或 target 解析歧义）。 */
export function sanitizeSessionName(id: string): string {
  return id.replaceAll(/[:.\\\s/]+/g, '-').slice(0, 64) || 'session'
}

/** 截断输出到 maxBytes，返回内容与是否截断。按 UTF-8 字节计算。 */
export function truncateOutput(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const raw = Buffer.from(text, 'utf8')
  if (raw.byteLength <= maxBytes) return { text, truncated: false }
  const head = raw.subarray(0, maxBytes)
  // 从最后一个完整 UTF-8 序列边界回退，避免截出乱码。
  let end = head.byteLength
  while (end > 0 && (head[end - 1]! & 0xc0) === 0x80) end -= 1
  if (end > 0 && (head[end - 1]! & 0xc0) === 0xc0) end -= 1
  return {
    text: head.subarray(0, Math.max(end, 1)).toString('utf8'),
    truncated: true
  }
}

/**
 * 校验既有容器挂载列表中是否包含指向 targetHostDir 的 targetWorkspaceDir 挂载。
 * 兼容 Windows（C:\path\to 或 C:/path/to）与 POSIX 路径格式。
 */
export function isWorkspaceMountMatching(
  binds: readonly string[] | undefined,
  targetHostDir: string,
  targetWorkspaceDir: string
): boolean {
  if (!binds || binds.length === 0) return false
  const targetHost = resolve(targetHostDir).replaceAll('\\', '/').toLowerCase().replace(/\/+$/, '')
  const targetContainer = targetWorkspaceDir.replaceAll('\\', '/').replace(/\/+$/, '')

  for (const bind of binds) {
    // 形式如：/host/path:/home/kali/workspace 或 C:\Users\path:/home/kali/workspace[:options]
    const match = bind.match(/^(.*?):(\/[^:]+)(?::.*)?$/)
    if (!match) continue
    const hostRaw = match[1]
    const containerRaw = match[2]
    if (!hostRaw || !containerRaw) continue
    const hostPart = resolve(hostRaw).replaceAll('\\', '/').toLowerCase().replace(/\/+$/, '')
    const containerPart = containerRaw.replace(/\/+$/, '')
    if (containerPart === targetContainer && hostPart === targetHost) {
      return true
    }
  }
  return false
}

/** 组装容器内执行脚本：cd → timeout 包裹 → 用户命令。 */
export function buildExecScript(input: {
  command: string
  cwd?: string
  timeoutSec: number
}): string {
  const parts: string[] = []
  if (input.cwd) parts.push(`mkdir -p ${shquote(input.cwd)} && cd ${shquote(input.cwd)} || exit 125`)
  // kill-after 兜底顽固进程（不接受 SIGTERM 的交互式工具）。
  const sec = Math.max(1, Math.ceil(input.timeoutSec))
  parts.push(`timeout --kill-after=${sec + 5} ${sec} bash -c ${shquote(input.command)}`)
  return parts.join(' && ')
}

/** 默认 runner：spawn docker CLI，超时杀客户端进程（容器内另有 timeout 主控制）。 */
export function createSpawnDockerRunner(dockerBin: string): SandboxDockerRunner {
  return (args, options) =>
    new Promise<SandboxProcessResult>((resolve) => {
      const child = spawn(dockerBin, args, { stdio: ['pipe', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      let timedOut = false
      const timer =
        options?.timeoutMs !== undefined
          ? setTimeout(() => {
              timedOut = true
              child.kill('SIGKILL')
            }, options.timeoutMs)
          : undefined
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })
      child.on('error', (error) => {
        if (timer) clearTimeout(timer)
        resolve({ stdout, stderr: `${stderr}${error.message}`, exitCode: null, timedOut })
      })
      child.on('close', (code) => {
        if (timer) clearTimeout(timer)
        resolve({ stdout, stderr, exitCode: code, timedOut })
      })
      if (options?.stdin !== undefined) {
        child.stdin.write(options.stdin)
        child.stdin.end()
      } else {
        child.stdin.end()
      }
    })
}

interface SessionRecord {
  info: SandboxSessionInfo
  /** 增量读取游标：已消费的 capture-pane 行数。 */
  cursorLines: number
}

export function createDockerSandboxAdapter(options: DockerSandboxOptions): RuntimeSandboxAdapter {
  const image = options.image ?? DEFAULT_SANDBOX_IMAGE
  const containerName = options.containerName
  const networkMode = options.networkMode ?? 'host'
  const capAdd = options.capAdd ?? ['NET_RAW', 'NET_ADMIN']
  const workspaceDir = options.workspaceDir ?? DEFAULT_SANDBOX_WORKSPACE
  const hostWorkspaceDir = options.hostWorkspaceDir
  const dockerBin = options.dockerBin ?? 'docker'
  const execTimeoutMs = options.execTimeoutMs ?? 120_000
  const maxOutputBytes = options.maxOutputBytes ?? 256 * 1024
  const runner: SandboxDockerRunner = options.runner ?? createSpawnDockerRunner(dockerBin)
  const sessions = new Map<string, SessionRecord>()
  let ensurePromise: Promise<void> | undefined

  const execInContainer = (script: string, timeoutMs: number) =>
    runner(['exec', containerName, 'bash', '-lc', script], { timeoutMs })

  async function inspect(): Promise<{
    state: SandboxState
    containerId?: string
    binds?: string[]
  }> {
    const result = await runner(
      [
        'inspect',
        '--type',
        'container',
        '--format',
        '{{.State.Status}}\n{{.Id}}\n{{json .HostConfig.Binds}}',
        containerName
      ],
      { timeoutMs: CONTROL_TIMEOUT_MS }
    )
    if (result.exitCode !== 0) {
      if (/no such object|not found|no such container/i.test(result.stderr))
        return { state: 'missing' }
      throw new Error(`docker inspect failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`)
    }
    const [status, id, rawBinds] = result.stdout.trim().split('\n')
    let binds: string[] | undefined
    if (rawBinds) {
      try {
        const parsed = JSON.parse(rawBinds)
        if (Array.isArray(parsed)) binds = parsed
      } catch {
        // 忽略 binds 反序列化异常
      }
    }
    if (status === 'running') return { state: 'running', containerId: id?.trim(), binds }
    return { state: 'stopped', containerId: id?.trim(), binds }
  }

  async function ensureStarted(): Promise<void> {
    const current = await inspect()
    if (current.state !== 'missing') {
      // 若指定了 hostWorkspaceDir 且既有容器已带有 binds 记录，检查挂载路径是否匹配
      if (
        hostWorkspaceDir &&
        current.binds !== undefined &&
        !isWorkspaceMountMatching(current.binds, hostWorkspaceDir, workspaceDir)
      ) {
        await runner(['rm', '-f', containerName], { timeoutMs: CONTROL_TIMEOUT_MS })
      } else if (current.state === 'running') {
        return
      } else if (current.state === 'stopped') {
        const started = await runner(['start', containerName], { timeoutMs: CONTROL_TIMEOUT_MS })
        if (started.exitCode !== 0) {
          throw new Error(`docker start ${containerName} failed: ${started.stderr.trim()}`)
        }
        return
      }
    }

    if (hostWorkspaceDir) {
      try {
        mkdirSync(hostWorkspaceDir, { recursive: true })
      } catch {
        // 忽略创建失败（例如权限问题留待 Docker 报错）
      }
    }

    const runArgs = ['run', '-d', '--name', containerName, '--network', networkMode]
    for (const cap of capAdd) runArgs.push('--cap-add', cap)
    if (hostWorkspaceDir) {
      const mountHost = resolve(hostWorkspaceDir).replaceAll('\\', '/')
      runArgs.push('-v', `${mountHost}:${workspaceDir}`)
    }
    runArgs.push(image)
    const created = await runner(runArgs, { timeoutMs: CONTROL_TIMEOUT_MS })
    if (created.exitCode !== 0) {
      throw new Error(
        `docker run ${image} failed: ${created.stderr.trim() || `exit ${created.exitCode}`}`
      )
    }
  }

  async function tmux(args: readonly string[], timeoutMs = SESSION_TIMEOUT_MS) {
    return runner(['exec', containerName, 'tmux', ...args], { timeoutMs })
  }

  async function readSessionPane(sessionId: string): Promise<string[]> {
    // -S - 捕获全部历史行；不带历史深度会漏掉滚出屏幕的内容（冒烟测试结论）。
    const captured = await tmux(['capture-pane', '-p', '-S', '-', '-t', sessionId])
    if (captured.exitCode !== 0) {
      throw new Error(`tmux capture-pane ${sessionId} failed: ${captured.stderr.trim()}`)
    }
    // 去掉 pane 底部的空白填充行，避免污染增量游标。
    const lines = captured.stdout.split('\n')
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    return lines
  }

  return {
    id: containerName,

    async status(): Promise<SandboxStatus> {
      const current = await inspect()
      return { state: current.state, containerId: current.containerId, image }
    },

    ensure(): Promise<void> {
      // 并发 ensure 串行化（调度器与工具层可能同时触发）。
      ensurePromise ??= ensureStarted().finally(() => {
        ensurePromise = undefined
      })
      return ensurePromise
    },

    async exec(command: string, execOptions?: SandboxExecOptions): Promise<SandboxExecResult> {
      await this.ensure()
      const timeoutMs = execOptions?.timeoutMs ?? execTimeoutMs
      const script = buildExecScript({
        command,
        cwd: execOptions?.cwd ?? workspaceDir,
        timeoutSec: timeoutMs / 1000
      })
      const args = ['exec']
      for (const [key, value] of Object.entries(execOptions?.env ?? {})) {
        args.push('-e', `${key}=${value}`)
      }
      args.push(containerName, 'bash', '-lc', script)
      const started = Date.now()
      const result = await runner(args, { timeoutMs: timeoutMs + EXEC_BACKSTOP_GRACE_MS })
      const stdout = truncateOutput(result.stdout, maxOutputBytes)
      const stderr = truncateOutput(result.stderr, maxOutputBytes)
      return {
        stdout: stdout.text,
        stderr: stderr.text,
        exitCode: result.exitCode,
        // 容器内 timeout 的退出码是 124；宿主兜底杀进程时 exitCode 为 null。
        timedOut: result.timedOut || result.exitCode === 124,
        truncated: stdout.truncated || stderr.truncated,
        durationMs: Date.now() - started
      }
    },

    async openSession(input: { id: string; command: string }): Promise<SandboxSessionInfo> {
      await this.ensure()
      const sessionId = sanitizeSessionName(input.id)
      const existing = sessions.get(sessionId)
      if (existing) return existing.info
      // 幂等：同名 tmux 会话已存在（如适配器重启后）则直接纳管。
      const probe = await tmux(['has-session', '-t', sessionId])
      if (probe.exitCode !== 0) {
        // 创建默认 shell 会话，再以键入方式下发命令 —— 与后续 sessionSend 语义一致。
        const created = await tmux(['new-session', '-d', '-s', sessionId])
        if (created.exitCode !== 0) {
          throw new Error(`tmux new-session ${sessionId} failed: ${created.stderr.trim()}`)
        }
        await tmux(['send-keys', '-t', sessionId, '-l', '--', input.command])
        await tmux(['send-keys', '-t', sessionId, 'Enter'])
      }
      const info: SandboxSessionInfo = {
        id: sessionId,
        command: input.command,
        createdAt: Date.now()
      }
      sessions.set(sessionId, { info, cursorLines: 0 })
      return info
    },

    async sessionSend(sessionId: string, input: string): Promise<void> {
      const record = sessions.get(sessionId)
      if (!record) throw new Error(`unknown sandbox session: ${sessionId}`)
      await tmux(['send-keys', '-t', sessionId, '-l', '--', input])
      await tmux(['send-keys', '-t', sessionId, 'Enter'])
    },

    async sessionRead(sessionId: string): Promise<SandboxSessionChunk> {
      const record = sessions.get(sessionId)
      if (!record) throw new Error(`unknown sandbox session: ${sessionId}`)
      const aliveProbe = await tmux(['has-session', '-t', sessionId])
      const lines = aliveProbe.exitCode === 0 ? await readSessionPane(sessionId) : []
      // tmux history-limit 滚动会丢弃最老行；历史行数小于游标（收缩）时
      // 说明中间内容已丢失，回退为全量返回，避免静默漏读。
      const cursor = record.cursorLines <= lines.length ? record.cursorLines : 0
      const fresh = lines.slice(cursor)
      record.cursorLines = lines.length
      return {
        sessionId,
        output: truncateOutput(fresh.join('\n'), maxOutputBytes).text,
        alive: aliveProbe.exitCode === 0
      }
    },

    async closeSession(sessionId: string): Promise<void> {
      const record = sessions.get(sessionId)
      if (!record) return
      sessions.delete(sessionId)
      await tmux(['kill-session', '-t', sessionId])
    },

    async listSessions(): Promise<readonly SandboxSessionInfo[]> {
      const listed = await tmux(['list-sessions', '-F', '#{session_name}'])
      if (listed.exitCode !== 0) return []
      const known = new Set(sessions.keys())
      return listed.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((name) => name.length > 0)
        .map((name) => {
          const record = sessions.get(name)
          known.delete(name)
          return (
            record?.info ?? { id: name, command: '(external)', createdAt: 0 }
          )
        })
        .concat([...known].map((name) => sessions.get(name)!.info))
    },

    async readFile(path: string): Promise<string> {
      await this.ensure()
      const result = await execInContainer(`cat ${shquote(path)}`, SESSION_TIMEOUT_MS)
      if (result.exitCode !== 0) {
        throw new Error(`sandbox readFile ${path} failed: ${result.stderr.trim()}`)
      }
      return truncateOutput(result.stdout, maxOutputBytes).text
    },

    async writeFile(path: string, content: string): Promise<void> {
      await this.ensure()
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.'
      const mkdir = await execInContainer(`mkdir -p ${shquote(dir)}`, SESSION_TIMEOUT_MS)
      if (mkdir.exitCode !== 0) {
        throw new Error(`sandbox writeFile ${path} failed: ${mkdir.stderr.trim()}`)
      }
      const result = await runner(
        ['exec', '-i', containerName, 'bash', '-lc', `cat > ${shquote(path)}`],
        { timeoutMs: SESSION_TIMEOUT_MS, stdin: content }
      )
      if (result.exitCode !== 0) {
        throw new Error(`sandbox writeFile ${path} failed: ${result.stderr.trim()}`)
      }
    },

    async dispose(): Promise<void> {
      // 停止但保留容器（README 常驻语义：工作区与证据现场保留）。
      sessions.clear()
      await runner(['stop', containerName], { timeoutMs: CONTROL_TIMEOUT_MS })
    }
  }
}
