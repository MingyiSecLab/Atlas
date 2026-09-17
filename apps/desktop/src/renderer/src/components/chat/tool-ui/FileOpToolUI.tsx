import { Check, Copy, FileCode } from 'lucide-react'
import { useState } from 'react'
import type { ToolBlock } from '../types'
import { HighlightedCode } from '../HighlightedCode'
import type { ParsedToolCall } from './types'
import { paper } from '@renderer/components/assistant-ui/elements/surfaces'
import { cn } from '@renderer/lib/utils'

interface FileOpToolUIProps {
  block: ToolBlock
  parsed: ParsedToolCall
}

function guessLanguage(filePath?: string): string {
  if (!filePath) return 'text'
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript'
    case 'js':
    case 'jsx':
      return 'javascript'
    case 'json':
      return 'json'
    case 'md':
      return 'markdown'
    case 'css':
      return 'css'
    case 'html':
      return 'html'
    case 'py':
      return 'python'
    case 'sh':
    case 'zsh':
    case 'bash':
      return 'shell'
    default:
      return 'text'
  }
}

export function FileOpToolUI({ block, parsed }: FileOpToolUIProps): React.ReactNode {
  const [copiedPath, setCopiedPath] = useState(false)
  const filePath = parsed.filePath || ''
  const args = parsed.parsedArgs
  const startLine = args?.StartLine as number | undefined
  const endLine = args?.EndLine as number | undefined
  const instruction = (args?.Instruction as string) || (args?.Description as string)
  const codeContent =
    (args?.CodeContent as string) ||
    (args?.ReplacementContent as string) ||
    (args?.TargetContent as string)

  const output = block.output || ''
  const lang = guessLanguage(filePath)

  const handleCopyPath = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (!filePath) return
    navigator.clipboard.writeText(filePath).then(() => {
      setCopiedPath(true)
      setTimeout(() => setCopiedPath(false), 1500)
    })
  }

  return (
    <div className="flex flex-col gap-2.5 p-1 text-xs">
      {/* File Path & Meta bar */}
      {filePath ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 font-mono text-[11.5px] text-foreground/90">
            <FileCode size={13} className="text-primary shrink-0" />
            <span className="truncate font-medium" title={filePath}>
              {filePath}
            </span>
            {startLine !== undefined ? (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-sans">
                L{startLine}
                {endLine && endLine !== startLine ? `-L${endLine}` : ''}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer shrink-0"
            onClick={handleCopyPath}
            title="复制文件路径"
          >
            {copiedPath ? (
              <>
                <Check size={11} className="text-emerald-500" />
                <span className="text-[10px] text-emerald-500 font-medium">已复制</span>
              </>
            ) : (
              <>
                <Copy size={11} />
                <span className="text-[10px]">复制路径</span>
              </>
            )}
          </button>
        </div>
      ) : null}

      {/* Instruction or Action Summary */}
      {instruction ? (
        <div className="rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-foreground/85 leading-relaxed">
          <span className="font-medium text-muted-foreground mr-1.5">说明:</span>
          <span>{instruction}</span>
        </div>
      ) : null}

      {/* Input Code / Target Replacement */}
      {codeContent ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            代码内容
          </div>
          <div className={cn(paper, 'rounded-xl overflow-hidden')}>
            <div className="max-h-72 overflow-auto p-3 font-mono text-[11.5px] leading-relaxed">
              <HighlightedCode code={codeContent} language={lang} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Execution Output */}
      {output ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            <span>执行结果</span>
            {block.outputTruncated ? (
              <small className="text-muted-foreground/60 font-normal lowercase tracking-normal">
                （已截断摘要）
              </small>
            ) : null}
          </div>
          <div className={cn(paper, 'rounded-xl overflow-hidden')}>
            <div className="max-h-64 overflow-auto p-3 font-mono text-[11.5px] leading-relaxed">
              <HighlightedCode
                code={output}
                language={lang === 'typescript' ? 'typescript' : 'text'}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
