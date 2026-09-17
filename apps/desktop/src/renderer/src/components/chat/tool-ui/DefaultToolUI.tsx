import { FileText } from 'lucide-react'
import type { ToolBlock } from '../types'
import { HighlightedCode } from '../HighlightedCode'
import { ToolError } from '@renderer/components/assistant-ui/elements/tool-error'
import type { ParsedToolCall } from './types'
import { paper } from '@renderer/components/assistant-ui/elements/surfaces'
import { cn } from '@renderer/lib/utils'

interface DefaultToolUIProps {
  block: ToolBlock
  parsed?: ParsedToolCall
}

function formatJsonIfPossible(str?: string): { formatted: string; isJson: boolean } {
  if (!str) return { formatted: '', isJson: false }
  const trimmed = str.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return { formatted: str, isJson: false }
  }
  try {
    const obj = JSON.parse(trimmed)
    return { formatted: JSON.stringify(obj, null, 2), isJson: true }
  } catch {
    return { formatted: str, isJson: false }
  }
}

export function DefaultToolUI({ block, parsed }: DefaultToolUIProps): React.ReactNode {
  const hasInput = Boolean(block.input)
  const hasOutput = Boolean(block.output || block.outputArtifact)

  const formattedInput = formatJsonIfPossible(block.input)
  const formattedOutput = formatJsonIfPossible(block.output)
  const isError = block.status === 'error' || block.status === 'denied'

  return (
    <div className="flex flex-col gap-2.5 p-1 text-xs">
      {/* 错误提示：使用 assistant-ui ToolError 组件 */}
      {isError && block.output ? (
        <ToolError
          name={parsed?.displayName || block.name}
          target={parsed?.chip || parsed?.primaryParam || '调用失败'}
          message={block.output}
        />
      ) : null}

      {/* PARAMETERS 区域 */}
      {hasInput ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            Parameters
          </div>
          <div className={cn(paper, 'rounded-xl overflow-hidden')}>
            <div className="max-h-64 overflow-auto p-3 font-mono text-[11.5px] leading-relaxed">
              <HighlightedCode
                code={formattedInput.formatted}
                language={formattedInput.isJson ? 'json' : 'text'}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* RESULT 区域 */}
      {hasOutput && block.status !== 'error' && block.output ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            <span>Result</span>
            {block.outputTruncated ? (
              <small className="text-muted-foreground/60 font-normal lowercase tracking-normal">
                （已截断）
              </small>
            ) : null}
          </div>
          <div className={cn(paper, 'rounded-xl overflow-hidden')}>
            <div className="max-h-72 overflow-auto p-3 font-mono text-[11.5px] leading-relaxed">
              <HighlightedCode
                code={formattedOutput.formatted}
                language={formattedOutput.isJson ? 'json' : 'text'}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Artifact 引用提示 */}
      {block.outputArtifact ? (
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-primary" />
            <span className="font-medium text-foreground">已保存输出产物 Artifact</span>
            <span className="text-[11px] text-muted-foreground">
              ({Math.ceil(block.outputArtifact.sizeBytes / 1024)} KB)
            </span>
          </div>
          {block.outputCaptureTruncated ? (
            <span className="text-[11px] text-amber-500">已截断</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
