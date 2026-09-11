export type TerminalReplayEvent =
  { type: 'write'; data: string } | { type: 'resize'; cols: number; rows: number }

export interface TerminalSession {
  initialSize(): { cols: number; rows: number } | null
  subscribe(
    onEvent: (event: TerminalReplayEvent) => void,
    onExit?: (code: number | null) => void
  ): () => void
  canControl(): boolean
  subscribeController(onChange: (canControl: boolean) => void): () => void
  replayWasTruncated(): boolean
  subscribeReplayTruncated(onChange: () => void): () => void
  sendInput(data: string): void
  resize(cols: number, rows: number): void
}

export interface LocalTerminalSessionOptions {
  id: string
  cols: number
  rows: number
  cwd?: string
  shell?: string
}

export type TerminalSessionStatus =
  | { state: 'idle' | 'starting' | 'running' }
  | { state: 'failed'; error: string }
  | { state: 'exited'; code: number | null }

const MAX_REPLAY_BYTES = 10 * 1024 * 1024
const MAX_REPLAY_EVENTS = 10_000
const textEncoder = new TextEncoder()
const GAP_CLEAR = '\u001b[2J\u001b[3J\u001b[H'

export class LocalTerminalSession implements TerminalSession {
  private readonly listeners = new Set<(event: TerminalReplayEvent) => void>()
  private readonly exitListeners = new Set<(code: number | null) => void>()
  private readonly controllerListeners = new Set<(canControl: boolean) => void>()
  private readonly replayListeners = new Set<() => void>()
  private readonly restartListeners = new Set<() => void>()
  private replay: TerminalReplayEvent[] = []
  private replayBytes = 0
  private exited = false
  private exitCode: number | null = null
  private canControlValue = true
  private unsubscribeData: (() => void) | null = null
  private unsubscribeExit: (() => void) | null = null
  private started = false
  private truncated = false
  private startAttempt = 0
  private restartEpoch = 0
  private status: TerminalSessionStatus = { state: 'idle' }
  private readonly statusListeners = new Set<() => void>()

  constructor(private readonly options: LocalTerminalSessionOptions) {
    this.replay.push({ type: 'resize', cols: options.cols, rows: options.rows })
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.exited = false
    this.exitCode = null
    this.setStatus({ state: 'starting' })
    const attempt = ++this.startAttempt
    this.unsubscribeData = window.api.onTerminalData((id, data) => {
      if (id !== this.options.id || this.exited) return
      this.append({ type: 'write', data })
    })
    this.unsubscribeExit = window.api.onTerminalExit((id, detail) => {
      if (id !== this.options.id || this.exited) return
      this.exited = true
      this.exitCode = detail.exitCode
      this.setStatus({ state: 'exited', code: this.exitCode })
      for (const listener of this.exitListeners) listener(this.exitCode)
    })
    void window.api
      .createTerminal(this.options.id, {
        cols: this.options.cols,
        rows: this.options.rows,
        cwd: this.options.cwd,
        shell: this.options.shell
      })
      .then((result) => {
        if (attempt !== this.startAttempt || !this.started) return
        if (result.ok) {
          this.setStatus({ state: 'running' })
        } else {
          this.started = false
          this.setStatus({ state: 'failed', error: result.error || '终端启动失败' })
        }
      })
      .catch((error) => {
        if (attempt !== this.startAttempt || !this.started) return
        this.started = false
        this.setStatus({
          state: 'failed',
          error: error instanceof Error ? error.message : String(error)
        })
      })
  }

  restart(): void {
    this.restartEpoch += 1
    this.stop(false)
    this.replay = [{ type: 'resize', cols: this.options.cols, rows: this.options.rows }]
    this.replayBytes = 0
    this.truncated = false
    for (const listener of this.replayListeners) listener()
    for (const listener of this.restartListeners) listener()
    this.start()
  }

  getRestartEpoch(): number {
    return this.restartEpoch
  }

  subscribeRestart(onChange: () => void): () => void {
    this.restartListeners.add(onChange)
    return () => this.restartListeners.delete(onChange)
  }

  getStatus(): TerminalSessionStatus {
    return this.status
  }

  subscribeStatus(onChange: () => void): () => void {
    this.statusListeners.add(onChange)
    return () => this.statusListeners.delete(onChange)
  }

  initialSize(): { cols: number; rows: number } {
    return { cols: this.options.cols, rows: this.options.rows }
  }

  subscribe(
    onEvent: (event: TerminalReplayEvent) => void,
    onExit?: (code: number | null) => void
  ): () => void {
    // A bounded replay can begin in the middle of an ANSI sequence. Reset the display before
    // replaying retained output so a reconnect never renders a torn escape sequence.
    if (this.truncated) onEvent({ type: 'write', data: GAP_CLEAR })
    for (const event of this.replay) onEvent(event)
    this.listeners.add(onEvent)
    if (onExit) {
      this.exitListeners.add(onExit)
      if (this.exited) onExit(this.exitCode)
    }
    return () => {
      this.listeners.delete(onEvent)
      if (onExit) this.exitListeners.delete(onExit)
    }
  }

  canControl(): boolean {
    return this.canControlValue && !this.exited
  }

  subscribeController(onChange: (canControl: boolean) => void): () => void {
    this.controllerListeners.add(onChange)
    return () => this.controllerListeners.delete(onChange)
  }

  replayWasTruncated(): boolean {
    return this.truncated
  }

  subscribeReplayTruncated(onChange: () => void): () => void {
    this.replayListeners.add(onChange)
    return () => this.replayListeners.delete(onChange)
  }

  sendInput(data: string): void {
    if (this.canControl()) window.api.sendTerminalInput(this.options.id, data)
  }

  resize(cols: number, rows: number): void {
    if (this.canControl()) {
      window.api.resizeTerminal(this.options.id, cols, rows)
      this.append({ type: 'resize', cols, rows })
    }
  }

  dispose(): void {
    this.stop(true)
    this.listeners.clear()
    this.exitListeners.clear()
    this.controllerListeners.clear()
    this.replayListeners.clear()
    this.statusListeners.clear()
    this.restartListeners.clear()
  }

  private stop(markIdle: boolean): void {
    this.startAttempt += 1
    this.unsubscribeData?.()
    this.unsubscribeExit?.()
    this.unsubscribeData = null
    this.unsubscribeExit = null
    this.started = false
    this.exited = false
    this.exitCode = null
    if (markIdle) {
      window.api.disposeTerminal(this.options.id)
      this.setStatus({ state: 'idle' })
    }
  }

  private setStatus(status: TerminalSessionStatus): void {
    this.status = status
    for (const listener of this.statusListeners) listener()
  }

  private append(event: TerminalReplayEvent): void {
    this.replay.push(event)
    if (event.type === 'write') this.replayBytes += textEncoder.encode(event.data).byteLength
    while (
      (this.replayBytes > MAX_REPLAY_BYTES || this.replay.length > MAX_REPLAY_EVENTS) &&
      this.replay.length > 1
    ) {
      const removed = this.replay.shift()
      if (removed?.type === 'write') {
        this.replayBytes -= textEncoder.encode(removed.data).byteLength
      }
      if (!this.truncated) {
        this.truncated = true
        for (const listener of this.replayListeners) listener()
      }
    }
    for (const listener of this.listeners) listener(event)
  }
}
