import { Check, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { HighlightedCode } from './HighlightedCode'
import { useCopyFeedback } from './useCopyFeedback'

const LONG_CODE_LINE_THRESHOLD = 25

export function CodeBlock({
  code,
  language,
  incomplete = false
}: {
  code: string
  language?: string
  incomplete?: boolean
}): React.ReactNode {
  const { copied, copy } = useCopyFeedback()
  const [isExpanded, setIsExpanded] = useState(false)

  const lineCount = useMemo(() => {
    return code ? code.split('\n').length : 0
  }, [code])

  const isLong = lineCount > LONG_CODE_LINE_THRESHOLD

  return (
    <div
      className={`chat-code-frame ${isLong && !isExpanded ? 'is-collapsed' : ''}`}
      data-incomplete={incomplete || undefined}
    >
      <div className="chat-code-header">
        <div className="chat-code-header-info">
          <span className="chat-code-lang">{language || 'text'}</span>
          {lineCount > 1 && <span className="chat-code-lines">{lineCount} 行</span>}
        </div>
        <div className="chat-code-header-actions">
          <button
            className="chat-icon-button"
            type="button"
            aria-label={copied ? '已复制' : '复制代码'}
            title={copied ? '已复制' : '复制代码'}
            onClick={() => copy(code)}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
      </div>
      <div className={`chat-code-panel ${isLong && !isExpanded ? 'has-mask' : ''}`}>
        <HighlightedCode code={code} language={language} />
      </div>
      {isLong && (
        <div className="chat-code-footer">
          <button
            type="button"
            className="chat-code-expand-btn"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
          >
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span>{isExpanded ? '收起代码' : `展开完整代码 (共 ${lineCount} 行)`}</span>
          </button>
        </div>
      )}
    </div>
  )
}
