import { Check, Copy, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ToolBlock } from '../types'
import { HighlightedCode } from '../HighlightedCode'
import { formatElapsedMs, type ParsedToolCall } from './types'

interface TerminalToolUIProps {
  block: ToolBlock
  parsed: ParsedToolCall
}

/** 超过该行数的输出默认折叠 */
const COLLAPSE_LINE_THRESHOLD = 14

/** best-effort：从输出 JSON 解析退出码 */
function parseExitCode(output: string): number | undefined {
  const trimmed = output.trim()
  if (!trimmed.startsWith('{')) return undefined
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    for (const key of ['exitCode', 'exit_code', 'code']) {
      const value = parsed[key]
      if (typeof value === 'number') return value
    }
  } catch {
    // 忽略非 JSON
  }
  return undefined
}

export function TerminalToolUI({ block, parsed }: TerminalToolUIProps): React.ReactNode {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const cmd = parsed.command || block.input || ''
  const output = block.output || ''
  const isRunning = block.status === 'running'
  const isError = block.status === 'error'
  const exitCode = useMemo(() => (isError ? parseExitCode(output) : undefined), [isError, output])
  const outputLineCount = useMemo(
    () => (output ? output.split('\n').length : 0),
    [output]
  )
  const collapsible = !expanded && outputLineCount > COLLAPSE_LINE_THRESHOLD

  const handleCopy = (textToCopy: string): void => {
    if (!textToCopy) return
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="aui-terminal-clean-container">
      {/* 命令行 PARAMETERS / COMMAND */}
      {cmd ? (
        <div className="aui-trace-section">
          <div className="aui-trace-label">COMMAND</div>
          <div className="aui-terminal-cmd-box">
            <span className="aui-terminal-prompt">$</span>
            <code className="aui-terminal-cmd-code">{cmd}</code>
            <button
              type="button"
              className="aui-trace-copy-btn"
              onClick={() => handleCopy(cmd)}
              title={copied ? '已复制' : '复制命令'}
            >
              {copied ? <Check size={12} className="is-success" /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      ) : null}

      {/* 执行结果 OUTPUT */}
      {output ? (
        <div className="aui-trace-section">
          <div className="aui-trace-label">
            <span>OUTPUT</span>
            {exitCode !== undefined ? (
              <span className="aui-trace-sublabel text-destructive">exit {exitCode}</span>
            ) : null}
            {!isRunning && block.elapsedMs !== undefined ? (
              <span className="aui-trace-sublabel">{formatElapsedMs(block.elapsedMs)}</span>
            ) : null}
          </div>

          <div
            className={`aui-terminal-output-box ${isError ? 'is-error' : ''} ${collapsible ? 'is-clamped' : ''}`}
          >
            <HighlightedCode code={output} language="shell" />
            {collapsible ? (
              <button
                type="button"
                className="aui-terminal-expand-btn"
                onClick={() => setExpanded(true)}
              >
                展开全部 {outputLineCount} 行
              </button>
            ) : null}
          </div>
        </div>
      ) : isRunning ? (
        <div className="aui-terminal-running-hint">
          <Loader2 size={13} className="aui-tool-spinner" />
          <span>正在执行命令...</span>
        </div>
      ) : (
        <div className="aui-terminal-empty-hint">
          <span>（执行完毕，无控制台输出）</span>
        </div>
      )}
    </div>
  )
}

