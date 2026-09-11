import { Check, Copy } from 'lucide-react'
import { HighlightedCode } from './HighlightedCode'
import { useCopyFeedback } from './useCopyFeedback'

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

  return (
    <div className="chat-code-frame" data-incomplete={incomplete || undefined}>
      <div className="chat-code-header">
        <span>{language || 'text'}</span>
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
      <div className="chat-code-panel">
        <HighlightedCode code={code} language={language} />
      </div>
    </div>
  )
}
