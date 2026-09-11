/**
 * 通用执行策略设施：超时/abort 竞速、并发与速率限制、输出截断。
 * 全部为纯机制，不含域语义（见 ADR-0003）。
 */

export const DEFAULT_TOOL_TIMEOUT_MS = 10_000
export const DEFAULT_TOOL_MAX_CONCURRENT = 4
export const DEFAULT_TOOL_MIN_INTERVAL_MS = 250
export const MAX_TOOL_OUTPUT_LENGTH = 256 * 1024

export function truncateToolOutput(output: string): string {
  return output.length > MAX_TOOL_OUTPUT_LENGTH
    ? `${output.slice(0, MAX_TOOL_OUTPUT_LENGTH)}\n…(truncated at ${MAX_TOOL_OUTPUT_LENGTH} bytes)`
    : output
}

export function raceToolAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('Tool execution was aborted.'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('Tool execution was aborted.'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (cause) => {
        signal.removeEventListener('abort', onAbort)
        reject(cause)
      }
    )
  })
}

const TIMEOUT_SENTINEL = '__tool_timeout__'

export function withToolTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(TIMEOUT_SENTINEL)), timeoutMs)
  })
  return Promise.race([raceToolAbort(promise, signal), timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export function isToolTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === TIMEOUT_SENTINEL
}

/**
 * 实例级并发上限 + 共享串行起跑链的速率限制。
 */
export class RuntimeToolLimiter {
  private inFlight = 0
  private lastStartedAt = 0
  private queue: Array<() => void> = []
  private paceChain: Promise<void> = Promise.resolve()

  async acquire(maxConcurrent: number, minIntervalMs: number): Promise<void> {
    for (;;) {
      if (this.inFlight < maxConcurrent) {
        this.inFlight += 1
        // 速率限制：所有执行共享一条串行的起跑链
        const wait = this.paceChain.then(async () => {
          const remaining = this.lastStartedAt + minIntervalMs - Date.now()
          if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
          this.lastStartedAt = Date.now()
        })
        this.paceChain = wait.catch(() => undefined)
        await wait
        return
      }
      await new Promise<void>((resolve) => this.queue.push(resolve))
    }
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1)
    const next = this.queue.shift()
    if (next) next()
  }
}
