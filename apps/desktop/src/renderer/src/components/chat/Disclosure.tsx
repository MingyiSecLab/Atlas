import { ChevronRight } from 'lucide-react'
import { useEffect, useRef } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { cn } from '@renderer/lib/utils'
import { collapsePanel } from '@renderer/components/assistant-ui/elements/surfaces'

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
    <Collapsible
      open={open}
      onOpenChange={() => {
        if (hasContent) onToggle()
      }}
      ref={rootRef}
      className="chat-disclosure"
      data-tone={tone}
      data-open={open || undefined}
    >
      <CollapsibleTrigger asChild disabled={!hasContent}>
        <button
          className="chat-disclosure-trigger cursor-pointer"
          type="button"
          aria-expanded={hasContent ? open : undefined}
        >
          <span className="chat-disclosure-icon">{icon}</span>
          <span className={running ? 'chat-disclosure-title is-running' : 'chat-disclosure-title'}>
            {title}
          </span>
          {summary ? <span className="chat-disclosure-summary">· {summary}</span> : null}
          {hasContent ? (
            <ChevronRight
              className={cn(
                'chat-disclosure-chevron transition-transform duration-200',
                open && 'rotate-90'
              )}
              size={14}
            />
          ) : null}
        </button>
      </CollapsibleTrigger>
      {hasContent ? (
        <CollapsibleContent className={cn('chat-disclosure-content', collapsePanel)}>
          {children}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  )
}
