import { Check, Copy, Loader2, Terminal as TerminalIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ToolBlock } from '../types'
import { HighlightedCode } from '../HighlightedCode'
import { formatElapsedMs, type ParsedToolCall } from './types'
import { mono, paper } from '@renderer/components/assistant-ui/elements/surfaces'
import { cn } from '@renderer/lib/utils'

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
  const outputLines = useMemo(() => (output ? output.split('\n') : []), [output])
  const outputLineCount = outputLines.length
  const collapsible = !expanded && outputLineCount > COLLAPSE_LINE_THRESHOLD

  const handleCopy = (textToCopy: string): void => {
    if (!textToCopy) return
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="flex flex-col gap-2.5 p-1 text-xs">
      {/* 命令行 COMMAND */}
      {cmd ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <TerminalIcon size={12} />
              <span>Command</span>
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              onClick={() => handleCopy(cmd)}
              title={copied ? '已复制' : '复制命令'}
            >
              {copied ? (
                <>
                  <Check size={11} className="text-emerald-500" />
                  <span className="text-[10px] text-emerald-500 font-medium">已复制</span>
                </>
              ) : (
                <>
                  <Copy size={11} />
                  <span className="text-[10px]">复制</span>
                </>
              )}
            </button>
          </div>
          <div
            className={cn(
              paper,
              'flex items-center gap-2 rounded-xl px-3 py-2 font-mono text-xs overflow-x-auto text-foreground/90 selection:bg-primary/20'
            )}
          >
            <span className="text-muted-foreground/60 select-none font-bold">$</span>
            <code className="flex-1 break-all whitespace-pre-wrap">{cmd}</code>
          </div>
        </div>
      ) : null}

      {/* 执行结果 OUTPUT */}
      {output ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            <span>Output</span>
            <div className="flex items-center gap-2 font-normal lowercase tracking-normal">
              {exitCode !== undefined ? (
                <span className={cn(mono, 'text-destructive font-medium')}>exit {exitCode}</span>
              ) : null}
              {!isRunning && block.elapsedMs !== undefined ? (
                <span className={cn(mono, 'text-muted-foreground/60')}>
                  {formatElapsedMs(block.elapsedMs)}
                </span>
              ) : null}
            </div>
          </div>

          <div
            className={cn(
              paper,
              'relative rounded-xl overflow-hidden',
              isError && 'border-destructive/40 bg-destructive/5'
            )}
          >
            <div
              className={cn(
                // 折叠态只裁纵向：横向仍可滚动，否则长行既无换行也无滚动条
                'p-3 font-mono text-[11.5px] leading-relaxed overflow-x-auto',
                collapsible && 'max-h-56 overflow-y-hidden'
              )}
            >
              <HighlightedCode code={output} language="shell" />
            </div>
            {collapsible ? (
              <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-card via-card/90 to-transparent pt-6 pb-2">
                <button
                  type="button"
                  className="rounded-lg border border-border/60 bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs hover:bg-accent hover:text-foreground transition-all cursor-pointer"
                  onClick={() => setExpanded(true)}
                >
                  展开全部 {outputLineCount} 行输出
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : isRunning ? (
        <div className="flex items-center gap-2 py-2 text-muted-foreground">
          <Loader2 size={13} className="animate-spin text-primary" />
          <span className="text-xs">正在执行命令并捕获控制台输出...</span>
        </div>
      ) : (
        <div className="py-1 text-xs text-muted-foreground/60 italic">
          （执行完毕，无控制台输出）
        </div>
      )}
    </div>
  )
}
