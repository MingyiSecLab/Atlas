/**
 * Kali 沙箱层测试：SPI 纯函数、DockerSandboxAdapter（注入 fake runner，无真实
 * Docker）、MockSandboxAdapter、kali_* pentest 工具（破坏性闸与执行器安全闸）。
 * 遵循仓库约定：不依赖 Docker、真实网络或个人 API Key。
 */
import { describe, expect, it } from 'vitest'
import {
  buildExecScript,
  createDockerSandboxAdapter,
  sanitizeSessionName,
  shquote,
  truncateOutput,
  type SandboxDockerRunner,
  type SandboxProcessResult
} from '../src/sandbox/index.js'
import { createMockSandboxAdapter } from '../src/sandbox/index.js'
import { createKaliSandboxTools } from '../src/tools/security-tools/kali-sandbox.js'
import { createRuntimePentestToolExecutor } from '../src/pentest/tools.js'

// ---------------------------------------------------------------------------
// 纯函数
// ---------------------------------------------------------------------------

describe('sandbox pure helpers', () => {
  it('shquote 转义单引号', () => {
    expect(shquote("it's")).toBe("'it'\\''s'")
    expect(shquote('nmap -sV 10.0.0.5')).toBe("'nmap -sV 10.0.0.5'")
  })

  it('sanitizeSessionName 剔除 tmux 非法字符', () => {
    expect(sanitizeSessionName('listener:4444')).toBe('listener-4444')
    expect(sanitizeSessionName('a.b/c d')).toBe('a-b-c-d')
    expect(sanitizeSessionName('---')).toBe('---')
    expect(sanitizeSessionName('正常名字')).toBe('正常名字')
  })

  it('truncateOutput 按字节截断且不产生乱码', () => {
    const ascii = 'a'.repeat(1000)
    const result = truncateOutput(ascii, 100)
    expect(result.truncated).toBe(true)
    expect(Buffer.byteLength(result.text, 'utf8')).toBe(100)
    // 中文 3 字节/字：截断点落在字符边界
    const cjk = '汉'.repeat(100)
    const cjkResult = truncateOutput(cjk, 10)
    expect(cjkResult.truncated).toBe(true)
    expect(cjkResult.text).toBe('汉汉汉')
    expect(truncateOutput('short', 100)).toEqual({ text: 'short', truncated: false })
  })

  it('buildExecScript 组装 cd 与 timeout 包裹', () => {
    const script = buildExecScript({ command: 'nmap -sV 10.0.0.5', cwd: '/tmp', timeoutSec: 30 })
    expect(script).toContain("cd '/tmp' || exit 125")
    expect(script).toContain('timeout --kill-after=35 30 bash -c')
    expect(script).toContain("'nmap -sV 10.0.0.5'")
    const noCwd = buildExecScript({ command: 'ls', timeoutSec: 500 })
    expect(noCwd).not.toContain('cd ')
    expect(noCwd).toContain('timeout --kill-after=505 500 bash -c')
  })
})

// ---------------------------------------------------------------------------
// DockerSandboxAdapter（fake runner）
// ---------------------------------------------------------------------------

interface FakeDockerState {
  exists: boolean
  status: string
  containerId: string
  tmuxSessions: Map<string, string[]>
  /** 每条 docker exec bash -lc 脚本的定制响应。 */
  execResponse?: (script: string) => SandboxProcessResult
}

function ok(stdout = ''): SandboxProcessResult {
  return { stdout, stderr: '', exitCode: 0, timedOut: false }
}

function fail(stderr: string, exitCode = 1): SandboxProcessResult {
  return { stdout: '', stderr, exitCode, timedOut: false }
}

function createFakeDocker(state: FakeDockerState) {
  const calls: string[][] = []
  const runner: SandboxDockerRunner = async (args) => {
    calls.push([...args])
    const [head, ...rest] = args
    if (head === 'inspect') {
      if (!state.exists) return fail(`Error: No such object: ${rest.at(-1)}`)
      return ok(`${state.status}\n${state.containerId}`)
    }
    if (head === 'run') {
      state.exists = true
      state.status = 'running'
      return ok(state.containerId)
    }
    if (head === 'start') {
      state.status = 'running'
      return ok()
    }
    if (head === 'stop') {
      state.status = 'exited'
      return ok()
    }
    if (args.includes('tmux')) {
      const tmuxIndex = args.indexOf('tmux')
      const sub = args[tmuxIndex + 1]
      // 会话名：-t <name>（多数子命令）或 -s <name>（new-session）
      const tIndex = args.indexOf('-t')
      const sIndex = args.indexOf('-s')
      const name = (tIndex >= 0 ? args[tIndex + 1] : undefined) ?? (sIndex >= 0 ? args[sIndex + 1] : undefined) ?? ''
      if (sub === 'has-session') return state.tmuxSessions.has(name) ? ok() : fail('no session', 1)
      if (sub === 'new-session') {
        state.tmuxSessions.set(name, [])
        return ok()
      }
      if (sub === 'capture-pane') {
        return ok(`${(state.tmuxSessions.get(name) ?? []).join('\n')}\n\n\n`)
      }
      if (sub === 'send-keys') {
        // send-keys -t n -l [--] <text> 或 send-keys -t n Enter
        const lIndex = args.indexOf('-l')
        let literal: string
        if (lIndex >= 0) {
          literal = args[lIndex + 1] === '--' ? (args[lIndex + 2] ?? '') : (args[lIndex + 1] ?? '')
        } else {
          literal = args.at(-1) ?? ''
        }
        const current = state.tmuxSessions.get(name)
        if (current) current.push(literal === 'Enter' ? '' : literal)
        return ok()
      }
      if (sub === 'kill-session') {
        state.tmuxSessions.delete(name)
        return ok()
      }
      if (sub === 'list-sessions') {
        const names = [...state.tmuxSessions.keys()]
        return names.length > 0 ? ok(names.join('\n')) : fail('no server running', 1)
      }
    }
    // docker exec ... bash -lc <script>
    if (head === 'exec') {
      const script = rest.at(-1) ?? ''
      if (state.execResponse) return state.execResponse(script)
      return ok()
    }
    return ok()
  }
  return { runner, calls }
}

function freshState(): FakeDockerState {
  return { exists: false, status: '', containerId: 'cid123', tmuxSessions: new Map() }
}

describe('docker sandbox adapter', () => {
  it('status 映射 running/stopped/missing', async () => {
    const running = createFakeDocker({ ...freshState(), exists: true, status: 'running' })
    const a = createDockerSandboxAdapter({ containerName: 'c', runner: running.runner })
    expect((await a.status()).state).toBe('running')

    const stopped = createFakeDocker({ ...freshState(), exists: true, status: 'exited' })
    const b = createDockerSandboxAdapter({ containerName: 'c', runner: stopped.runner })
    expect((await b.status()).state).toBe('stopped')

    const missing = createFakeDocker(freshState())
    const c = createDockerSandboxAdapter({ containerName: 'c', runner: missing.runner })
    expect((await c.status()).state).toBe('missing')
  })

  it('ensure：missing 拉起容器，stopped 复用 start', async () => {
    const missingState = freshState()
    const missing = createFakeDocker(missingState)
    const a = createDockerSandboxAdapter({ containerName: 'mingyi-sandbox', runner: missing.runner })
    await a.ensure()
    expect(missingState.exists).toBe(true)
    expect(missing.calls.some((args) => args[0] === 'run' && args.includes('mingyi-sandbox:latest'))).toBe(
      true
    )

    const stoppedState: FakeDockerState = { ...freshState(), exists: true, status: 'exited' }
    const stopped = createFakeDocker(stoppedState)
    const b = createDockerSandboxAdapter({ containerName: 'mingyi-sandbox', runner: stopped.runner })
    await b.ensure()
    expect(stoppedState.status).toBe('running')
    expect(stopped.calls.some((args) => args[0] === 'run')).toBe(false)
  })

  it('exec：容器内 timeout(124) 与宿主兜底均标记 timedOut，超长输出截断', async () => {
    const state: FakeDockerState = {
      ...freshState(),
      exists: true,
      status: 'running',
      execResponse: (script) => {
        if (script.includes("'sleep 999'")) return { stdout: '', stderr: '', exitCode: 124, timedOut: false }
        // 宿主侧兜底：docker 客户端被看门狗杀死，拿不到退出码
        if (script.includes("'hang'")) return { stdout: '', stderr: '', exitCode: null, timedOut: true }
        if (script.includes("'big'")) return ok('x'.repeat(5000))
        return ok()
      }
    }
    const fake = createFakeDocker(state)
    const adapter = createDockerSandboxAdapter({
      containerName: 'c',
      runner: fake.runner,
      maxOutputBytes: 1000
    })
    const timedOut = await adapter.exec('sleep 999')
    expect(timedOut.timedOut).toBe(true)
    expect(timedOut.exitCode).toBe(124)

    const killed = await adapter.exec('hang', { timeoutMs: 50 })
    expect(killed.timedOut).toBe(true)

    const big = await adapter.exec('big')
    expect(big.truncated).toBe(true)
    expect(big.stdout.length).toBeLessThanOrEqual(1000)
  })

  it('会话：增量读取游标推进，历史收缩时回退全量，幂等 openSession', async () => {
    const state = { ...freshState(), exists: true, status: 'running' }
    const fake = createFakeDocker(state)
    const adapter = createDockerSandboxAdapter({ containerName: 'c', runner: fake.runner })

    await adapter.openSession({ id: 'listen', command: 'nc -k -lvp 4444' })
    const again = await adapter.openSession({ id: 'listen', command: 'nc -k -lvp 4444' })
    expect(again.id).toBe('listen')

    const pane = state.tmuxSessions.get('listen')!
    pane.push('line-1', 'line-2')
    const first = await adapter.sessionRead('listen')
    expect(first.output).toContain('line-1')
    expect(first.output).toContain('line-2')
    expect(first.alive).toBe(true)

    pane.push('line-3')
    const second = await adapter.sessionRead('listen')
    expect(second.output).toBe('line-3')

    // 模拟 tmux history-limit 滚动丢最老行：游标越界回退为全量
    pane.splice(0, pane.length, 'only-survivor')
    const clamped = await adapter.sessionRead('listen')
    expect(clamped.output).toBe('only-survivor')

    await adapter.closeSession('listen')
    expect(state.tmuxSessions.has('listen')).toBe(false)
  })

  it('writeFile 通过 stdin 传内容，readFile 失败抛错', async () => {
    const state: FakeDockerState = {
      ...freshState(),
      exists: true,
      status: 'running',
      execResponse: (script) => (script.includes("cat '") ? fail('No such file', 1) : ok())
    }
    let stdinSeen: string | undefined
    const fake = createFakeDocker(state)
    const wrappedRunner: SandboxDockerRunner = async (args, options) => {
      if (options?.stdin !== undefined) stdinSeen = options.stdin
      return fake.runner(args, options)
    }
    const adapter = createDockerSandboxAdapter({ containerName: 'c', runner: wrappedRunner })
    await adapter.writeFile('/home/kali/workspace/poc.py', 'print("hi")')
    expect(stdinSeen).toBe('print("hi")')

    await expect(adapter.readFile('/nope')).rejects.toThrow(/readFile/)
  })

  it('dispose 停止容器但保留（不删除）', async () => {
    const state = { ...freshState(), exists: true, status: 'running' }
    const fake = createFakeDocker(state)
    const adapter = createDockerSandboxAdapter({ containerName: 'c', runner: fake.runner })
    await adapter.dispose()
    expect(state.status).toBe('exited')
    expect(state.exists).toBe(true)
    expect(fake.calls.some((args) => args[0] === 'rm')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// MockSandboxAdapter
// ---------------------------------------------------------------------------

describe('mock sandbox adapter', () => {
  it('exec 钩子与调用记录', async () => {
    const mock = createMockSandboxAdapter({
      exec: (command) => (command.includes('whoami') ? 'root' : undefined)
    })
    expect((await mock.exec('whoami')).stdout).toBe('root')
    expect((await mock.exec('echo hi')).stdout).toBe('hi')
    expect((await mock.exec('cat /missing')).exitCode).toBe(1)
    expect(mock.calls[0]).toMatchObject({ method: 'exec', command: 'whoami' })
  })

  it('文件与会话闭环', async () => {
    const mock = createMockSandboxAdapter()
    await mock.writeFile('/tmp/x', 'content-1')
    expect(await mock.readFile('/tmp/x')).toBe('content-1')

    await mock.openSession({ id: 's1', command: 'nc -lvp 4444' })
    await mock.sessionSend('s1', 'id')
    const chunk = await mock.sessionRead('s1')
    expect(chunk.output).toContain('nc -lvp 4444')
    expect(chunk.output).toContain('id')
    expect(chunk.alive).toBe(true)
    const second = await mock.sessionRead('s1')
    expect(second.output).toBe('')
    await mock.closeSession('s1')
    await expect(mock.sessionRead('s1')).rejects.toThrow(/unknown/)
  })
})

// ---------------------------------------------------------------------------
// kali_* pentest 工具（破坏性闸 + 执行器安全闸）
// ---------------------------------------------------------------------------

const localPolicy = {
  executionMode: 'authorized-active' as const,
  scope: ['127.0.0.1', 'sandbox']
}

function kaliExecutor(mock = createMockSandboxAdapter()) {
  return { mock, executor: createRuntimePentestToolExecutor(createKaliSandboxTools({ adapter: mock })) }
}

describe('kali sandbox tools', () => {
  it('工具集命名与类别', () => {
    const { executor } = kaliExecutor()
    const names = executor.list().map((tool) => `${tool.name}:${tool.kind}`)
    expect(names).toContain('kali_exec:active')
    expect(names).toContain('kali_session_start:active')
    expect(names).toContain('kali_file_read:read-only')
    expect(names).toContain('kali_file_write:read-only')
    expect(names).toHaveLength(7)
  })

  it('kali_exec 执行并标注退出码；破坏性命令被 fail-closed 拦截', async () => {
    const { mock, executor } = kaliExecutor()
    const result = await executor.execute(
      { targetRef: '127.0.0.1', toolName: 'kali_exec', arguments: { command: 'echo pwned' } },
      { signal: new AbortController().signal, workspacePath: '/tmp', scope: localPolicy.scope, allowDestructive: false },
      localPolicy
    )
    expect(result.output).toContain('pwned')
    expect(result.output).toContain('[exit=0]')
    expect(mock.calls.some((call) => call.command === 'echo pwned')).toBe(true)

    await expect(
      executor.execute(
        { targetRef: '127.0.0.1', toolName: 'kali_exec', arguments: { command: 'rm -rf / --no-preserve-root' } },
        { signal: new AbortController().signal, workspacePath: '/tmp', scope: localPolicy.scope, allowDestructive: false },
        localPolicy
      )
    ).rejects.toThrow(/Destructive action blocked/)

    await expect(
      executor.execute(
        { targetRef: '127.0.0.1', toolName: 'kali_exec', arguments: { command: 'mysql -e "DROP TABLE users"' } },
        { signal: new AbortController().signal, workspacePath: '/tmp', scope: localPolicy.scope, allowDestructive: false },
        localPolicy
      )
    ).rejects.toThrow(/Destructive action blocked/)
  })

  it('会话键入同样过破坏性闸', async () => {
    const { executor } = kaliExecutor()
    await executor.execute(
      { targetRef: 'sandbox', toolName: 'kali_session_start', arguments: { sessionId: 's', command: 'nc -k -lvp 4444' } },
      { signal: new AbortController().signal, workspacePath: '/tmp', scope: localPolicy.scope, allowDestructive: false },
      localPolicy
    )
    await expect(
      executor.execute(
        { targetRef: 'sandbox', toolName: 'kali_session_send', arguments: { sessionId: 's', input: 'dd if=/dev/zero of=/dev/sda' } },
        { signal: new AbortController().signal, workspacePath: '/tmp', scope: localPolicy.scope, allowDestructive: false },
        localPolicy
      )
    ).rejects.toThrow(/Destructive action blocked/)
  })

  it('执行器安全闸：read-only 模式禁 kali_exec；scope 外 target 拒绝', async () => {
    const { executor } = kaliExecutor()
    const context = {
      signal: new AbortController().signal,
      workspacePath: '/tmp',
      scope: localPolicy.scope,
      allowDestructive: false
    }
    await expect(
      executor.execute(
        { targetRef: '127.0.0.1', toolName: 'kali_exec', arguments: { command: 'ls' } },
        context,
        { ...localPolicy, executionMode: 'read-only' }
      )
    ).rejects.toThrow(/authorized-active/)

    await expect(
      executor.execute(
        { targetRef: '10.99.0.1', toolName: 'kali_exec', arguments: { command: 'ls' } },
        context,
        localPolicy
      )
    ).rejects.toThrow(/outside authorized scope/)
  })

  it('文件读写走沙箱本地 target', async () => {
    const { mock, executor } = kaliExecutor()
    const context = {
      signal: new AbortController().signal,
      workspacePath: '/tmp',
      scope: localPolicy.scope,
      allowDestructive: false
    }
    await executor.execute(
      { targetRef: 'sandbox', toolName: 'kali_file_write', arguments: { path: '/tmp/w', content: 'data' } },
      context,
      localPolicy
    )
    const read = await executor.execute(
      { targetRef: 'sandbox', toolName: 'kali_file_read', arguments: { path: '/tmp/w' } },
      context,
      localPolicy
    )
    expect(read.output).toBe('data')
    expect(mock.calls.some((call) => call.method === 'writeFile' && call.path === '/tmp/w')).toBe(true)
  })
})
