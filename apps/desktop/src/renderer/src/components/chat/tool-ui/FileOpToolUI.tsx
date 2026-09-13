import { Check, Copy, FileCode } from 'lucide-react'
import { useState } from 'react'
import type { ToolBlock } from '../types'
import { HighlightedCode } from '../HighlightedCode'
import type { ParsedToolCall } from './types'

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
    <div className="aui-file-op-container">
      {/* File Path & Meta bar */}
      {filePath ? (
        <div className="aui-file-meta-bar">
          <div className="aui-file-path-group">
            <FileCode size={13} className="aui-file-icon" />
            <span className="aui-file-path-text" title={filePath}>
              {filePath}
            </span>
            {startLine !== undefined ? (
              <span className="aui-file-line-range">
                L{startLine}
                {endLine && endLine !== startLine ? `-L${endLine}` : ''}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="aui-file-path-copy-btn"
            onClick={handleCopyPath}
            title="复制文件路径"
          >
            {copiedPath ? <Check size={12} className="is-success" /> : <Copy size={12} />}
          </button>
        </div>
      ) : null}

      {/* Instruction or Action Summary */}
      {instruction ? (
        <div className="aui-file-instruction">
          <span className="aui-file-instruction-label">说明:</span>
          <span>{instruction}</span>
        </div>
      ) : null}

      {/* Input Code / Target Replacement */}
      {codeContent ? (
        <div className="aui-file-code-section">
          <div className="aui-file-section-label">代码内容</div>
          <div className="aui-file-code-wrapper">
            <HighlightedCode code={codeContent} language={lang} />
          </div>
        </div>
      ) : null}

      {/* Execution Output */}
      {output ? (
        <div className="aui-file-code-section">
          <div className="aui-file-section-label">
            <span>执行结果</span>
            {block.outputTruncated ? <small>（已截断摘要）</small> : null}
          </div>
          <div className="aui-file-code-wrapper">
            <HighlightedCode
              code={output}
              language={lang === 'typescript' ? 'typescript' : 'text'}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
