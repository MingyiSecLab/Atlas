import {
  Check,
  ChevronDown,
  Copy,
  FileCode,
  Search,
  ShieldCheck,
  Terminal,
  Wrench
} from 'lucide-react'
import { useState } from 'react'
import type { ToolBlock } from '../types'
import { ToolStatusBadge } from './ToolStatusBadge'
import type { ParsedToolCall } from './types'

interface ToolHeaderProps {
  block: ToolBlock
  parsed: ParsedToolCall
  isOpen: boolean
  onToggle: () => void
  hasContent: boolean
}

export function ToolHeader({
  block,
  parsed,
  isOpen,
  onToggle,
  hasContent
}: ToolHeaderProps): React.ReactNode {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent): void => {
    e.stopPropagation()
    const textToCopy = block.output || block.input || ''
    if (!textToCopy) return
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const getCategoryIcon = (): React.ReactNode => {
    switch (parsed.category) {
      case 'terminal':
        return <Terminal size={14} className="aui-tool-type-icon is-terminal" />
      case 'file_op':
        return <FileCode size={14} className="aui-tool-type-icon is-file" />
      case 'search':
        return <Search size={14} className="aui-tool-type-icon is-search" />
      case 'security':
        return <ShieldCheck size={14} className="aui-tool-type-icon is-security" />
      case 'general':
      default:
        return <Wrench size={14} className="aui-tool-type-icon is-general" />
    }
  }

  return (
    <div
      className={`aui-tool-header ${isOpen ? 'is-open' : ''} ${hasContent ? 'is-clickable' : ''}`}
      onClick={hasContent ? onToggle : undefined}
      role="button"
      tabIndex={hasContent ? 0 : undefined}
      onKeyDown={(e) => {
        if (hasContent && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onToggle()
        }
      }}
      aria-expanded={hasContent ? isOpen : undefined}
    >
      <div className="aui-tool-header-left">
        <span className="aui-tool-icon-wrapper">{getCategoryIcon()}</span>
        <div className="aui-tool-title-group">
          <span className="aui-tool-display-name">{parsed.displayName}</span>
          <span className="aui-tool-code-name">{block.name}</span>
        </div>

        {parsed.primaryParam ? (
          <span className="aui-tool-param-pill" title={parsed.primaryParam}>
            {parsed.primaryParam}
          </span>
        ) : block.summary ? (
          <span className="aui-tool-param-pill" title={block.summary}>
            {block.summary}
          </span>
        ) : null}
      </div>

      <div className="aui-tool-header-right">
        <ToolStatusBadge status={block.status} />

        {hasContent ? (
          <button
            type="button"
            className="aui-tool-action-btn"
            title={copied ? '已复制' : '复制工具内容'}
            onClick={handleCopy}
          >
            {copied ? <Check size={13} className="is-success" /> : <Copy size={13} />}
          </button>
        ) : null}

        {hasContent ? (
          <span className={`aui-tool-chevron ${isOpen ? 'is-expanded' : ''}`}>
            <ChevronDown size={14} />
          </span>
        ) : null}
      </div>
    </div>
  )
}
