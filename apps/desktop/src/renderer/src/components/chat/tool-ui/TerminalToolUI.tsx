import { Check, Copy, Terminal } from 'lucide-react'
import { useState } from 'react'
import type { ToolBlock } from '../types'
import { HighlightedCode } from '../HighlightedCode'
import type { ParsedToolCall } from './types'

interface TerminalToolUIProps {
  block: ToolBlock
  parsed: ParsedToolCall
}

export function TerminalToolUI({ block, parsed }: TerminalToolUIProps): React.ReactNode {
  const [copiedOutput, setCopiedOutput] = useState(false)
  const cmd = parsed.command || block.input || ''
  const output = block.output || ''
  const cwd = (parsed.parsedArgs?.Cwd as string) || (parsed.parsedArgs?.cwd as string)
  const isKali = block.name === 'kali_exec'

  const handleCopy = (): void => {
    if (!output) return
    navigator.clipboard.writeText(output).then(() => {
      setCopiedOutput(true)
      setTimeout(() => setCopiedOutput(false), 1500)
    })
  }

  return (
    <div className="aui-terminal-container">
      {/* macOS Terminal Window Titlebar */}
      <div className="aui-terminal-titlebar">
        <div className="aui-terminal-window-dots">
          <span className="dot dot-close" />
          <span className="dot dot-minimize" />
          <span className="dot dot-maximize" />
        </div>
        <div className="aui-terminal-title">
          <Terminal size={12} />
          <span>
            {isKali ? 'kali-linux' : 'terminal'}
            {cwd ? ` · ${cwd.split('/').pop() || cwd}` : ''}
          </span>
        </div>
        {output ? (
          <button
            type="button"
            className="aui-terminal-copy-btn"
            onClick={handleCopy}
            title={copiedOutput ? '已复制' : '复制终端输出'}
          >
            {copiedOutput ? <Check size={11} /> : <Copy size={11} />}
            <span>{copiedOutput ? '已复制' : '复制'}</span>
          </button>
        ) : (
          <div style={{ width: 48 }} />
        )}
      </div>

      {/* Terminal Command Line */}
      {cmd ? (
        <div className="aui-terminal-command-line">
          <span className="aui-terminal-prompt">$</span>
          <span className="aui-terminal-command-text">{cmd}</span>
        </div>
      ) : null}

      {/* Terminal Output */}
      {output ? (
        <div className="aui-terminal-output">
          <HighlightedCode code={output} language="shell" />
        </div>
      ) : block.status === 'running' ? (
        <div className="aui-terminal-running-hint">
          <span className="aui-terminal-cursor-blink">▋</span>
          <span>命令执行中...</span>
        </div>
      ) : (
        <div className="aui-terminal-empty-hint">
          <span>（执行完毕，无控制台输出）</span>
        </div>
      )}
    </div>
  )
}
