import { cjk } from '@streamdown/cjk'
import { isValidElement, memo } from 'react'
import type { Components } from 'streamdown'
import { Streamdown, useIsCodeFenceIncomplete } from 'streamdown'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { useCopyFeedback } from '@renderer/components/chat/useCopyFeedback'
import { TooltipIconButton } from './tooltip-icon-button'
import { cn } from '@renderer/lib/utils'

const FENCE_LANGUAGE = /language-(\S+)/

function getFenceText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (
    isValidElement<{ children?: unknown }>(children) &&
    typeof children.props.children === 'string'
  ) {
    return children.props.children
  }
  return ''
}

function FencedCode({
  className,
  children
}: React.ComponentProps<'code'> & { node?: unknown }): React.ReactNode {
  const incomplete = useIsCodeFenceIncomplete()
  const language = FENCE_LANGUAGE.exec(className ?? '')?.[1]
  const code = getFenceText(children).replace(/\n+$/, '')
  const { copied, copy } = useCopyFeedback()

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border/60 bg-muted/40 text-xs">
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/70 px-3.5 py-1.5 font-mono text-[11px] text-muted-foreground">
        <span>{language || 'text'}</span>
        <TooltipIconButton
          tooltip={copied ? '已复制' : '复制代码'}
          onClick={() => copy(code)}
          className="size-6 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          {copied ? (
            <CheckIcon className="size-3.5 text-emerald-500" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
        </TooltipIconButton>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-[13px] leading-relaxed">
        <code>{code}</code>
      </pre>
      {incomplete && (
        <span className="inline-block h-3 w-1.5 animate-pulse bg-blue-500/70 ml-3.5 mb-2" />
      )}
    </div>
  )
}

function MarkdownLink({
  children,
  href,
  node,
  ...props
}: React.ComponentProps<'a'> & { node?: unknown }): React.ReactNode {
  void node
  if (href?.startsWith('javascript:')) {
    return <span>{children} [blocked]</span>
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline underline-offset-2 hover:opacity-80"
      {...props}
    >
      {children}
    </a>
  )
}

const components: Components = {
  a: MarkdownLink,
  code: FencedCode,
  inlineCode: ({ children, node, ...props }) => {
    void node
    return (
      <code
        className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground/85"
        {...props}
      >
        {children}
      </code>
    )
  }
}

export const MarkdownText = memo(function MarkdownText({
  text,
  className
}: {
  text?: string
  className?: string
}) {
  const content = typeof text === 'string' ? text : ''
  if (!content) return null

  return (
    <Streamdown
      className={cn('chat-markdown aui-md leading-relaxed break-words text-[14px]', className)}
      components={components}
      controls={false}
      isAnimating={false}
      plugins={{ cjk }}
    >
      {content}
    </Streamdown>
  )
})
