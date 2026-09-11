import type { WebContents } from 'electron'
import { ipcMain } from 'electron'
import { homedir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'
import { platform } from 'node:process'
import { spawn } from 'node-pty'
import type { IPty } from 'node-pty'
import { createHeadlessTerminal } from 'restty/headless'
import { loadResttyWasm } from 'restty/internal'

interface TerminalSession {
  pty: IPty
  owner: WebContents
  headless: Awaited<ReturnType<typeof createHeadlessTerminal>>
}

export interface TerminalCreateOptions {
  cols?: number
  rows?: number
  cwd?: string
  shell?: string
}

export interface TerminalCreateResult {
  ok: boolean
  error?: string
}

const terminalSessions = new Map<string, TerminalSession>()
const terminalAttempts = new Map<string, number>()
let resttyWasm: ReturnType<typeof loadResttyWasm> | undefined

function defaultShell(preferred?: string): string {
  if (preferred === 'zsh' || preferred === 'bash') return preferred
  if (platform === 'win32') return process.env.COMSPEC || 'powershell.exe'
  return process.env.SHELL || '/bin/sh'
}

function defaultShellArgs(): string[] {
  return platform === 'darwin' ? ['-l'] : []
}

function terminalEnvironment(): Record<string, string> {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )
  delete environment.TERM_SESSION_ID
  delete environment.TERM_PROGRAM_VERSION
  environment.TERM_PROGRAM = 'Mingyi'
  environment.SHELL_SESSIONS_DISABLE = '1'
  environment.COLORTERM = 'truecolor'
  return environment
}

function normalizeSize(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(max, Math.floor(value as number)))
}

function workingDirectory(cwd?: string): string {
  if (!cwd) return homedir()
  return isAbsolute(cwd) ? cwd : resolve(homedir(), cwd)
}

function disposeTerminal(id: string, owner?: WebContents): void {
  const session = terminalSessions.get(id)
  if (session && owner && session.owner !== owner) return
  terminalAttempts.set(id, (terminalAttempts.get(id) ?? 0) + 1)
  if (!session) return
  terminalSessions.delete(id)
  session.headless.dispose()
  session.pty.kill()
}

function disposeOwner(owner: WebContents): void {
  for (const [id, session] of terminalSessions) {
    if (session.owner === owner) disposeTerminal(id, owner)
  }
}

async function createTerminal(
  owner: WebContents,
  id: string,
  options: TerminalCreateOptions = {}
): Promise<TerminalCreateResult> {
  disposeTerminal(id)
  const attempt = (terminalAttempts.get(id) ?? 0) + 1
  terminalAttempts.set(id, attempt)
  const cols = normalizeSize(options.cols, 80, 1000)
  const rows = normalizeSize(options.rows, 24, 1000)
  try {
    const wasm = await (resttyWasm ??= loadResttyWasm())
    if (owner.isDestroyed() || terminalAttempts.get(id) !== attempt) {
      return { ok: false, error: '终端启动已取消' }
    }
    const headless = await createHeadlessTerminal({
      cols,
      rows,
      maxScrollbackBytes: 0,
      replay: false,
      wasm
    })
    if (owner.isDestroyed() || terminalAttempts.get(id) !== attempt) {
      headless.dispose()
      return { ok: false, error: '终端启动已取消' }
    }
    const pty = spawn(defaultShell(options.shell), defaultShellArgs(), {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: workingDirectory(options.cwd),
      env: terminalEnvironment()
    })
    terminalSessions.set(id, { pty, owner, headless })
    pty.onData((data) => {
      const session = terminalSessions.get(id)
      if (!session || session.pty !== pty) return
      session.headless.write(data)
      const reply = session.headless.drainOutput()
      if (reply.length > 0) pty.write(reply)
      if (!owner.isDestroyed()) owner.send('terminal:data', id, data)
    })
    pty.onExit(({ exitCode, signal }) => {
      const session = terminalSessions.get(id)
      if (session?.pty === pty) {
        session.headless.dispose()
        terminalSessions.delete(id)
        if (!owner.isDestroyed()) owner.send('terminal:exit', id, { exitCode, signal })
      }
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function registerTerminalService(): () => void {
  ipcMain.handle(
    'terminal:create',
    (event, id: string, options?: TerminalCreateOptions): Promise<TerminalCreateResult> =>
      createTerminal(event.sender, id, options)
  )
  ipcMain.on('terminal:input', (event, id: string, data: string) => {
    const session = terminalSessions.get(id)
    if (session?.owner === event.sender && typeof data === 'string') session.pty.write(data)
  })
  ipcMain.on('terminal:resize', (event, id: string, cols: number, rows: number) => {
    const session = terminalSessions.get(id)
    if (session?.owner !== event.sender) return
    session.pty.resize(normalizeSize(cols, 80, 1000), normalizeSize(rows, 24, 1000))
  })
  ipcMain.on('terminal:dispose', (event, id: string) => disposeTerminal(id, event.sender))

  return () => {
    ipcMain.removeHandler('terminal:create')
    for (const [id] of terminalSessions) disposeTerminal(id)
    terminalAttempts.clear()
  }
}

export function watchTerminalOwner(owner: WebContents): void {
  owner.once('destroyed', () => disposeOwner(owner))
}
