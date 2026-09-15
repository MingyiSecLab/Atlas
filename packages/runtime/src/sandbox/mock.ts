/**
 * 脚本化 Mock 沙箱适配器：无 Docker、无网络，供单测与 fake 模式使用。
 *
 * 通过 `exec` / `onSessionInput` 钩子注入确定性行为；未命中钩子时对
 * `echo` / `cat` / `sleep` 提供最小模拟。所有调用记录在 `calls` 中供断言。
 */

import type {
  RuntimeSandboxAdapter,
  SandboxExecOptions,
  SandboxExecResult,
  SandboxSessionChunk,
  SandboxSessionInfo,
  SandboxState
} from './types.js'

export interface MockSandboxCall {
  method: 'exec' | 'openSession' | 'sessionSend' | 'sessionRead' | 'closeSession' | 'readFile' | 'writeFile'
  command?: string
  cwd?: string
  path?: string
  content?: string
  input?: string
  sessionId?: string
}

export interface MockSandboxOptions {
  /** exec 行为钩子；返回 string 视为 stdout，完整对象可覆盖 exitCode/stderr 等。 */
  exec?: (command: string, options?: SandboxExecOptions) => string | Partial<SandboxExecResult>
  /** 会话收到输入时触发；返回的文本会作为新输出追加到会话。 */
  onSessionInput?: (sessionId: string, input: string) => string | undefined
  /** exec 前回调（可用于断言最终下发的命令）。 */
  onExec?: (command: string, options?: SandboxExecOptions) => void
}

interface MockSession {
  info: SandboxSessionInfo
  output: string[]
  cursor: number
  alive: boolean
}

export interface MockSandboxAdapter extends RuntimeSandboxAdapter {
  /** 全部调用记录（按序），供测试断言。 */
  readonly calls: readonly MockSandboxCall[]
  /** 直接强制状态（模拟容器被外部停止等）。 */
  setState(state: SandboxState): void
}

export function createMockSandboxAdapter(options: MockSandboxOptions = {}): MockSandboxAdapter {
  const calls: MockSandboxCall[] = []
  const files = new Map<string, string>()
  const sessions = new Map<string, MockSession>()
  let state: SandboxState = 'missing'

  const simulateExec = (command: string, options?: SandboxExecOptions): SandboxExecResult => {
    const trimmed = command.trim()
    const base: SandboxExecResult = {
      stdout: '',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      truncated: false,
      durationMs: 0
    }
    if (trimmed.startsWith('echo ')) {
      return { ...base, stdout: trimmed.slice(5) }
    }
    if (trimmed.startsWith('cat ')) {
      const path = trimmed.slice(4).trim().replace(/^['"]|['"]$/g, '')
      const content = files.get(path)
      if (content === undefined) {
        return { ...base, exitCode: 1, stderr: `cat: ${path}: No such file or directory` }
      }
      return { ...base, stdout: content }
    }
    if (trimmed.startsWith('sleep ')) {
      const seconds = Number.parseFloat(trimmed.slice(6))
      const budget = (options?.timeoutMs ?? 120_000) / 1000
      if (Number.isFinite(seconds) && seconds > budget) {
        return { ...base, exitCode: 124, timedOut: true }
      }
    }
    return base
  }

  return {
    id: 'mock-sandbox',
    calls,
    setState(next: SandboxState) {
      state = next
    },

    async status() {
      return { state, image: 'mock-sandbox:latest' }
    },

    async ensure() {
      if (state === 'missing') state = 'running'
      if (state === 'stopped') state = 'running'
    },

    async exec(command, execOptions) {
      options.onExec?.(command, execOptions)
      calls.push({ method: 'exec', command, cwd: execOptions?.cwd })
      await this.ensure()
      const override = options.exec?.(command, execOptions)
      const result =
        typeof override === 'string'
          ? { ...simulateExec(command, execOptions), stdout: override }
          : { ...simulateExec(command, execOptions), ...(override ?? {}) }
      return { ...result, durationMs: result.durationMs || 1 }
    },

    async openSession(input) {
      calls.push({ method: 'openSession', command: input.command, sessionId: input.id })
      await this.ensure()
      const existing = sessions.get(input.id)
      if (existing) return existing.info
      const info: SandboxSessionInfo = {
        id: input.id,
        command: input.command,
        createdAt: Date.now()
      }
      sessions.set(input.id, { info, output: [`$ ${input.command}`], cursor: 0, alive: true })
      return info
    },

    async sessionSend(sessionId, input) {
      calls.push({ method: 'sessionSend', sessionId, input })
      const session = sessions.get(sessionId)
      if (!session) throw new Error(`unknown sandbox session: ${sessionId}`)
      session.output.push(input)
      const extra = options.onSessionInput?.(sessionId, input)
      if (extra !== undefined) session.output.push(...extra.split('\n'))
    },

    async sessionRead(sessionId): Promise<SandboxSessionChunk> {
      calls.push({ method: 'sessionRead', sessionId })
      const session = sessions.get(sessionId)
      if (!session) throw new Error(`unknown sandbox session: ${sessionId}`)
      const fresh = session.output.slice(session.cursor)
      session.cursor = session.output.length
      return { sessionId, output: fresh.join('\n'), alive: session.alive }
    },

    async closeSession(sessionId) {
      calls.push({ method: 'closeSession', sessionId })
      const session = sessions.get(sessionId)
      if (!session) return
      session.alive = false
      sessions.delete(sessionId)
    },

    async listSessions() {
      return [...sessions.values()].map((session) => session.info)
    },

    async readFile(path) {
      calls.push({ method: 'readFile', path })
      const content = files.get(path)
      if (content === undefined) throw new Error(`sandbox readFile ${path} failed: not found`)
      return content
    },

    async writeFile(path, content) {
      calls.push({ method: 'writeFile', path, content })
      files.set(path, content)
    },

    async dispose() {
      sessions.clear()
      state = 'stopped'
    }
  }
}
