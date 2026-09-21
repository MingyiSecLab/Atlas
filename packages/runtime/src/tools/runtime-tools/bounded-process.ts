/**
 * 有界子进程执行：以 argv 数组 spawn（不经 shell，杜绝注入），对
 * stdout/stderr 施加共享字节预算，并对墙钟时间施加超时。
 *
 * 超时处理：先 SIGTERM，{@link KILL_ESCALATE_MS} 后仍未退出则 SIGKILL。
 * 供安全工具域（如 run_code_query）等需要运行外部引擎的场景复用。
 */
import { type ChildProcess, spawn } from 'node:child_process'

const KILL_ESCALATE_MS = 2_000

function killChildTree(child: ChildProcess, signal: NodeJS.Signals, detached: boolean): void {
  const pid = child.pid
  if (detached && pid && process.platform !== 'win32') {
    try {
      process.kill(-pid, signal)
    } catch {
      /* process may be gone */
    }
  }
  try {
    child.kill(signal)
  } catch {
    /* already exited */
  }
}

export interface BoundedSpawnInput {
  command: readonly string[]
  cwd: string
  timeoutSeconds: number
  maxTotalBytes: number
  /** 为 true 时（非 Windows）在新进程组中启动，kill(-pid) 可一并结束子孙进程。 */
  detached?: boolean
}

export interface BoundedSpawnResult {
  stdout: string
  stderr: string
  exitCode: number | null
  outputTruncated: boolean
  timedOut: boolean
}

export async function runSpawnBounded(input: BoundedSpawnInput): Promise<BoundedSpawnResult> {
  const program = input.command[0]
  if (!program) {
    return {
      stdout: '',
      stderr: 'Empty command',
      exitCode: null,
      outputTruncated: false,
      timedOut: false
    }
  }

  const detached = input.detached === true && process.platform !== 'win32'

  return new Promise<BoundedSpawnResult>((resolvePromise) => {
    const child = spawn(program, input.command.slice(1), {
      cwd: input.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached
    })

    let stdout = ''
    let stderr = ''
    let totalBytes = 0
    let outputTruncated = false
    let settled = false
    let killedByTimeout = false
    let escalateTimer: ReturnType<typeof setTimeout> | undefined
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined

    const finish = (result: BoundedSpawnResult) => {
      if (settled) return
      settled = true
      if (timeoutTimer) clearTimeout(timeoutTimer)
      if (escalateTimer) clearTimeout(escalateTimer)
      resolvePromise(result)
    }

    // stdout/stderr 共享同一字节预算；超限即丢弃并标记截断
    const append = (target: 'stdout' | 'stderr', data: Buffer) => {
      if (totalBytes >= input.maxTotalBytes) {
        outputTruncated = true
        return
      }
      const room = input.maxTotalBytes - totalBytes
      const buf = data.byteLength > room ? data.subarray(0, room) : data
      const text = buf.toString()
      if (target === 'stdout') stdout += text
      else stderr += text
      totalBytes += buf.byteLength
      if (buf.byteLength < data.byteLength) outputTruncated = true
    }

    timeoutTimer = setTimeout(() => {
      killedByTimeout = true
      killChildTree(child, 'SIGTERM', detached)
      escalateTimer = setTimeout(() => {
        if (settled) return
        killChildTree(child, 'SIGKILL', detached)
        finish({
          stdout,
          stderr: `${stderr}\n[mingyi] command timed out (SIGKILL)\n`,
          exitCode: 124,
          outputTruncated,
          timedOut: true
        })
      }, KILL_ESCALATE_MS)
    }, input.timeoutSeconds * 1000)

    child.stdout?.on('data', (data: Buffer) => append('stdout', data))
    child.stderr?.on('data', (data: Buffer) => append('stderr', data))

    child.on('close', (code) => {
      finish({
        stdout,
        stderr,
        exitCode: code,
        outputTruncated,
        timedOut: killedByTimeout
      })
    })

    child.on('error', (error) => {
      finish({
        stdout,
        stderr: stderr + error.message,
        exitCode: null,
        outputTruncated,
        timedOut: killedByTimeout
      })
    })
  })
}
