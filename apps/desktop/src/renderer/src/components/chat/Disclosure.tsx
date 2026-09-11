import { ChevronRight } from 'lucide-react'
import { useEffect, useRef } from 'react'

export function Disclosure({
  open,
  onToggle,
  icon,
  title,
  summary,
  running = false,
  tone = 'default',
  children
}: {
  open: boolean
  onToggle: () => void
  icon: React.ReactNode
  title: string
  summary?: string
  running?: boolean
  tone?: 'default' | 'error'
  children?: React.ReactNode
}): React.ReactNode {
  const hasContent = children !== undefined && children !== null
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  return (
    <div ref={rootRef} className="chat-disclosure" data-tone={tone} data-open={open || undefined}>
      <button
        className="chat-disclosure-trigger"
        type="button"
        aria-expanded={hasContent ? open : undefined}
        disabled={!hasContent}
        onClick={onToggle}
      >
        <span className="chat-disclosure-icon">{icon}</span>
        <span className={running ? 'chat-disclosure-title is-running' : 'chat-disclosure-title'}>
          {title}
        </span>
        {summary ? <span className="chat-disclosure-summary">· {summary}</span> : null}
        {hasContent ? <ChevronRight className="chat-disclosure-chevron" size={14} /> : null}
      </button>
      {hasContent && open ? <div className="chat-disclosure-content">{children}</div> : null}
    </div>
  )
}
