/**
 * kali 沙箱工具域：把 RuntimeSandboxAdapter 包装为 pentest 的 RuntimePentestTool。
 *
 * 架构定位（见 container/README.md）：桌面端是唯一大脑，Kali 容器是纯执行环境。
 * 安全模型与 http_request 相同（见 ADR-0003）：
 * - executor 统一承载 白名单 → 授权模式 → scope(targetRef) → 审批 四道闸，
 *   以及超时/abort/并发/速率/输出截断
 * - 每条下发到沙箱的 shell 命令（含会话键入）都经 assertCommandActionAllowed
 *   按破坏性分类 fail-closed 把关
 * - shell 命令可达的主机范围由模型自觉遵守 scope + engagement 审批约束，
 *   执行器只强制校验 targetRef（与 http_request 校验首跳同粒度）
 * - 会话与文件工具不直接触达目标；targetRef 仅为通过 scope 闸的声明值
 */
import { assertCommandActionAllowed } from '../../pentest/destructive-guard.js'
import type { RuntimePentestTool, RuntimePentestToolCommand } from '../../pentest/tools.js'
import type { RuntimeSandboxAdapter } from '../../sandbox/types.js'

const MAX_COMMAND_LENGTH = 32_768
const MAX_SESSION_INPUT_LENGTH = 8_192
const MAX_FILE_CONTENT_LENGTH = 256 * 1024
const DEFAULT_EXEC_TIMEOUT_MS = 120_000

function requireString(value: unknown, field: string, maxLength = MAX_COMMAND_LENGTH): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`kali tool argument "${field}" must be a non-empty string.`)
  }
  if (value.length > maxLength) {
    throw new Error(`kali tool argument "${field}" exceeds ${maxLength} characters.`)
  }
  return value
}

function optionalString(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined
  return requireString(value, field, maxLength)
}

/**
 * 沙箱本地操作（会话/文件）的默认 targetRef：不触达目标，
 * 仅供执行器 scope 闸在宽松 scope（含通配）下通过。
 */
export const KALI_SANDBOX_LOCAL_TARGET = 'sandbox'

export interface KaliSandboxToolOptions {
  adapter: RuntimeSandboxAdapter
}

/**
 * 组装 kali 沙箱工具集（kali_exec / kali_session_* / kali_file_*）。
 * 未提供 adapter 时返回空集，pentest 工具面保持向后兼容。
 */
export function createKaliSandboxTools(options: KaliSandboxToolOptions): readonly RuntimePentestTool[] {
  const adapter = options.adapter

  const kaliExec: RuntimePentestTool = {
    name: 'kali_exec',
    kind: 'active',
    description: [
      'Run one shell command inside the isolated Kali sandbox container (nmap, nuclei, ffuf,',
      'sqlmap, impacket, …) and capture stdout/stderr with exit code. The sandbox has the full',
      'Kali headless toolchain, offline knowledge bases (/home/kali/knowledges), and PoC repos',
      '(/home/kali/pocs); large scan outputs should be redirected to files under',
      '/home/kali/workspace and read back with kali_file_read (truncated).',
      'Arguments: command (required shell command), target (required authorized target ref,',
      'e.g. the in-scope host/URL this command operates on), cwd (optional working dir),',
      'timeoutMs (optional, default 120000).',
      'Commands must stay within the authorized scope; destructive operations',
      '(rm -rf /, dd, mkfs, drop table via DB clients, …) are blocked unless destructive',
      'testing is enabled for the engagement.'
    ].join(' '),
    timeoutMs: DEFAULT_EXEC_TIMEOUT_MS,
    async execute(command: RuntimePentestToolCommand, context) {
      const cmd = requireString(command.arguments.command, 'command')
      assertCommandActionAllowed(cmd, { allowDestructive: context.allowDestructive })
      const cwd = optionalString(command.arguments.cwd, 'cwd', 1024)
      const timeoutMs =
        typeof command.arguments.timeoutMs === 'number' && command.arguments.timeoutMs > 0
          ? Math.min(command.arguments.timeoutMs, 600_000)
          : DEFAULT_EXEC_TIMEOUT_MS
      const result = await adapter.exec(cmd, { cwd, timeoutMs })
      const output =
        [
          result.stdout.trim(),
          result.stderr.trim() ? `[stderr]\n${result.stderr.trim()}` : ''
        ]
          .filter(Boolean)
          .join('\n') || '(no output)'
      return {
        output: `${output}\n[exit=${result.exitCode ?? 'null'}${result.timedOut ? ' timedOut' : ''}${result.truncated ? ' truncated' : ''}]`,
        exitCode: result.exitCode ?? undefined,
        timedOut: result.timedOut
      }
    }
  }

  const kaliSessionStart: RuntimePentestTool = {
    name: 'kali_session_start',
    kind: 'active',
    description: [
      'Start a persistent background session in the Kali sandbox backed by tmux — for',
      'listeners (nc -k -lvp), reverse-shell catchers, long scans or interactive exploits.',
      'The command keeps running between calls; poll output with kali_session_read.',
      'Arguments: sessionId (required, stable name you choose), command (required),',
      'target (optional authorized target ref).'
    ].join(' '),
    timeoutMs: 15_000,
    async execute(command: RuntimePentestToolCommand, context) {
      const sessionId = requireString(command.arguments.sessionId, 'sessionId', 128)
      const cmd = requireString(command.arguments.command, 'command')
      assertCommandActionAllowed(cmd, { allowDestructive: context.allowDestructive })
      const info = await adapter.openSession({ id: sessionId, command: cmd })
      return { output: `session ${info.id} started: ${info.command}` }
    }
  }

  const kaliSessionSend: RuntimePentestTool = {
    name: 'kali_session_send',
    kind: 'active',
    description: [
      'Send one line of input to an interactive Kali sandbox session (typed into the tmux',
      'shell; Enter is appended automatically). Input is subject to the same destructive',
      'guard as kali_exec. Follow with kali_session_read to observe the response.',
      'Arguments: sessionId (required), input (required).'
    ].join(' '),
    timeoutMs: 15_000,
    async execute(command: RuntimePentestToolCommand, context) {
      const sessionId = requireString(command.arguments.sessionId, 'sessionId', 128)
      const input = requireString(command.arguments.input, 'input', MAX_SESSION_INPUT_LENGTH)
      assertCommandActionAllowed(input, { allowDestructive: context.allowDestructive })
      await adapter.sessionSend(sessionId, input)
      return { output: `sent to ${sessionId}: ${input}` }
    }
  }

  const kaliSessionRead: RuntimePentestTool = {
    name: 'kali_session_read',
    kind: 'active',
    description: [
      'Read new output since the last read from a Kali sandbox session (incremental).',
      'Reports whether the session is still alive. Use to poll listeners, reverse-shell',
      'catchers and interactive exploit sessions.',
      'Arguments: sessionId (required).'
    ].join(' '),
    timeoutMs: 15_000,
    async execute(command: RuntimePentestToolCommand) {
      const sessionId = requireString(command.arguments.sessionId, 'sessionId', 128)
      const chunk = await adapter.sessionRead(sessionId)
      return {
        output: `${chunk.output || '(no new output)'}\n[alive=${chunk.alive}]`,
        exitCode: chunk.alive ? 0 : 1
      }
    }
  }

  const kaliSessionClose: RuntimePentestTool = {
    name: 'kali_session_close',
    kind: 'active',
    description: [
      'Close a Kali sandbox session and terminate its processes.',
      'Arguments: sessionId (required).'
    ].join(' '),
    timeoutMs: 15_000,
    async execute(command: RuntimePentestToolCommand) {
      const sessionId = requireString(command.arguments.sessionId, 'sessionId', 128)
      await adapter.closeSession(sessionId)
      return { output: `session ${sessionId} closed` }
    }
  }

  const kaliFileRead: RuntimePentestTool = {
    name: 'kali_file_read',
    kind: 'read-only',
    description: [
      'Read a text file from the Kali sandbox workspace (scan reports, tool XML output,',
      'captured data). Output is truncated to the sandbox output cap.',
      'Arguments: path (required, absolute or workspace-relative).'
    ].join(' '),
    timeoutMs: 15_000,
    async execute(command: RuntimePentestToolCommand) {
      const path = requireString(command.arguments.path, 'path', 1024)
      const content = await adapter.readFile(path)
      return { output: content || '(empty file)' }
    }
  }

  const kaliFileWrite: RuntimePentestTool = {
    name: 'kali_file_write',
    kind: 'read-only',
    description: [
      'Write a text file into the Kali sandbox workspace (PoC scripts, wordlists, notes).',
      'Sandbox-local operation: does not touch the assessment target.',
      'Arguments: path (required), content (required).'
    ].join(' '),
    timeoutMs: 15_000,
    async execute(command: RuntimePentestToolCommand) {
      const path = requireString(command.arguments.path, 'path', 1024)
      const content = requireString(command.arguments.content, 'content', MAX_FILE_CONTENT_LENGTH)
      await adapter.writeFile(path, content)
      return { output: `wrote ${content.length} bytes to ${path}` }
    }
  }

  return [
    kaliExec,
    kaliSessionStart,
    kaliSessionSend,
    kaliSessionRead,
    kaliSessionClose,
    kaliFileRead,
    kaliFileWrite
  ]
}
