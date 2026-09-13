import { AlertCircle, FileText } from 'lucide-react'
import { useState } from 'react'
import type { ToolBlock } from '../types'
import { HighlightedCode } from '../HighlightedCode'
import type { ParsedToolCall } from './types'

interface DefaultToolUIProps {
  block: ToolBlock
  parsed: ParsedToolCall
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

export function DefaultToolUI({ block }: DefaultToolUIProps): React.ReactNode {
  const hasInput = Boolean(block.input)
  const hasOutput = Boolean(block.output || block.outputArtifact)

  // Default active tab: show output if available, else input
  const [activeTab, setActiveTab] = useState<'input' | 'output'>(hasOutput ? 'output' : 'input')

  const formattedInput = formatJsonIfPossible(block.input)
  const formattedOutput = formatJsonIfPossible(block.output)

  return (
    <div className="aui-default-tool-container">
      {/* Tabs if both input and output are present */}
      {hasInput && hasOutput ? (
        <div className="aui-default-tabs">
          <button
            type="button"
            className={`aui-default-tab-btn ${activeTab === 'output' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('output')}
          >
            执行结果
          </button>
          <button
            type="button"
            className={`aui-default-tab-btn ${activeTab === 'input' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('input')}
          >
            调用参数
          </button>
        </div>
      ) : null}

      {/* Input Tab / Section */}
      {hasInput && (!hasOutput || activeTab === 'input') ? (
        <div className="aui-default-section">
          {!hasOutput ? <div className="aui-default-section-title">调用参数</div> : null}
          <div className="aui-default-code-wrapper">
            <HighlightedCode
              code={formattedInput.formatted}
              language={formattedInput.isJson ? 'json' : 'text'}
            />
          </div>
        </div>
      ) : null}

      {/* Output Tab / Section */}
      {hasOutput && (!hasInput || activeTab === 'output') ? (
        <div className="aui-default-section">
          {!hasInput ? (
            <div className="aui-default-section-title">
              <span>执行结果</span>
              {block.outputTruncated ? <small>（已截断）</small> : null}
            </div>
          ) : null}

          {block.status === 'error' && block.output ? (
            <div className="aui-tool-error-callout">
              <AlertCircle size={14} className="aui-tool-error-icon" />
              <div className="aui-tool-error-content">{block.output}</div>
            </div>
          ) : block.output ? (
            <div className="aui-default-code-wrapper">
              <HighlightedCode
                code={formattedOutput.formatted}
                language={formattedOutput.isJson ? 'json' : 'text'}
              />
            </div>
          ) : null}

          {block.outputArtifact ? (
            <div className="chat-tool-artifact aui-tool-artifact-box">
              <div className="chat-tool-artifact-heading">
                <div>
                  <FileText size={14} />
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
      ) : null}
    </div>
  )
}
