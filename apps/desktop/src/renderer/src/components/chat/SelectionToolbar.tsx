import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Quote, Sparkles, ShieldAlert, Copy, Check } from 'lucide-react'

export interface SelectionToolbarProps {
  onQuote?: (text: string) => void
  onExplain?: (text: string) => void
  onAudit?: (text: string) => void
}

interface SelectionPosition {
  top: number
  left: number
  text: string
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  onQuote,
  onExplain,
  onAudit
}) => {
  const [position, setPosition] = useState<SelectionPosition | null>(null)
  const [copied, setCopied] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleSelectionChange = (): void => {
      requestAnimationFrame(() => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
          setPosition(null)
          return
        }

        const text = selection.toString().trim()
        if (!text) {
          setPosition(null)
          return
        }

        const range = selection.getRangeAt(0)
        let container = range.commonAncestorContainer as HTMLElement | null
        if (container?.nodeType === Node.TEXT_NODE) {
          container = container.parentElement
        }

        // 仅在属于聊天消息区内时触发
        const messageEl = container?.closest('[data-message-id]')
        if (!messageEl) {
          setPosition(null)
          return
        }

        const rect = range.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) {
          setPosition(null)
          return
        }

        setPosition({
          top: Math.max(10, rect.top - 8),
          left: Math.max(120, Math.min(window.innerWidth - 120, rect.left + rect.width / 2)),
          text
        })
      })
    }

    const handleScroll = (): void => {
      setPosition(null)
    }

    document.addEventListener('mouseup', handleSelectionChange)
    document.addEventListener('keyup', handleSelectionChange)
    document.addEventListener('scroll', handleScroll, true)

    return () => {
      document.removeEventListener('mouseup', handleSelectionChange)
      document.removeEventListener('keyup', handleSelectionChange)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [])

  if (!position) return null

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(position.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 忽略剪切板复制异常
    }
  }

  const handleQuote = (): void => {
    onQuote?.(position.text)
    setPosition(null)
    window.getSelection()?.removeAllRanges()
  }

  const handleExplain = (): void => {
    onExplain?.(position.text)
    setPosition(null)
    window.getSelection()?.removeAllRanges()
  }

  const handleAudit = (): void => {
    onAudit?.(position.text)
    setPosition(null)
    window.getSelection()?.removeAllRanges()
  }

  return createPortal(
    <div
      ref={toolbarRef}
      className="selection-toolbar-root"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        transform: 'translate(-50%, -100%)',
        zIndex: 9999
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="selection-toolbar-inner" role="toolbar" aria-label="选中文本操作工具栏">
        <button
          type="button"
          className="selection-toolbar-btn"
          title="引用所选文本到输入框"
          onClick={handleQuote}
        >
          <Quote size={12} />
          <span>引用</span>
        </button>

        <button
          type="button"
          className="selection-toolbar-btn"
          title="针对所选内容向 AI 发起解释提问"
          onClick={handleExplain}
        >
          <Sparkles size={12} />
          <span>解释</span>
        </button>

        <button
          type="button"
          className="selection-toolbar-btn"
          title="对所选内容进行安全风险与漏洞分析"
          onClick={handleAudit}
        >
          <ShieldAlert size={12} />
          <span>安全审计</span>
        </button>

        <div className="selection-toolbar-divider" />

        <button
          type="button"
          className={`selection-toolbar-btn ${copied ? 'is-copied' : ''}`}
          title="复制所选文字"
          onClick={handleCopy}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
    </div>,
    document.body
  )
}
