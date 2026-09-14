import { FileText } from 'lucide-react'
import type { ToolBlock } from '../types'
import { HighlightedCode } from '../HighlightedCode'
import { ToolError } from '@renderer/components/assistant-ui/elements/tool-error'
import type { ParsedToolCall } from './types'

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
    <div className="aui-default-tool-container space-y-2.5">
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
        <div className="aui-trace-section">
          <div className="aui-trace-label">PARAMETERS</div>
          <div className="aui-trace-block">
            <HighlightedCode
              code={formattedInput.formatted}
              language={formattedInput.isJson ? 'json' : 'text'}
            />
          </div>
        </div>
      ) : null}

      {/* RESULT 区域 (非纯错误时展示，错误在顶部已由 banner 清晰呈现) */}
      {hasOutput && block.status !== 'error' && block.output ? (
        <div className="aui-trace-section">
          <div className="aui-trace-label">
            <span>RESULT</span>
            {block.outputTruncated ? <span className="aui-trace-sublabel">（已截断）</span> : null}
          </div>
          <div className="aui-trace-block">
            <HighlightedCode
              code={formattedOutput.formatted}
              language={formattedOutput.isJson ? 'json' : 'text'}
            />
          </div>
        </div>
      ) : null}

      {/* Artifact 引用提示 */}
      {block.outputArtifact ? (
        <div className="chat-tool-artifact aui-tool-artifact-box">
          <div className="chat-tool-artifact-heading">
            <div>
              <FileText size={13} />
              <span>已保存的输出 Artifact</span>
              <small>{Math.ceil(block.outputArtifact.sizeBytes / 1024)} KB</small>
            </div>
          </div>
          {block.outputCaptureTruncated ? (
            <p className="chat-tool-artifact-notice">输出超过保存上限，Artifact 已截断。</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
