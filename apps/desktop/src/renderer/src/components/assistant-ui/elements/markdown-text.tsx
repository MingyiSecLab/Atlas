import { cjk } from '@streamdown/cjk'
import { isValidElement, memo, useMemo, useState } from 'react'
import type { Components } from 'streamdown'
import { Streamdown, useIsCodeFenceIncomplete } from 'streamdown'
import { CheckIcon, ChevronDown, ChevronUp, CopyIcon } from 'lucide-react'
import { useCopyFeedback } from '@renderer/components/chat/useCopyFeedback'
import { TooltipIconButton } from './tooltip-icon-button'
import { HighlightedCode } from '@renderer/components/chat/HighlightedCode'
import { cn } from '@renderer/lib/utils'

const FENCE_LANGUAGE = /language-(\S+)/
const LONG_CODE_LINE_THRESHOLD = 25

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
  const [isExpanded, setIsExpanded] = useState(false)

  const lineCount = useMemo(() => {
    return code ? code.split('\n').length : 0
  }, [code])

  const isLong = lineCount > LONG_CODE_LINE_THRESHOLD

  return (
    <div
      className={cn(
        'my-3 overflow-hidden rounded-xl border border-border/60 bg-muted/25 text-xs shadow-xs',
        isLong && !isExpanded && 'max-h-[380px] relative'
      )}
      data-incomplete={incomplete || undefined}
    >
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/60 px-3.5 py-1.5 font-mono text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground/75 lowercase">{language || 'text'}</span>
          {lineCount > 1 && <span className="text-muted-foreground/60">{lineCount} 行</span>}
        </div>
        <div className="flex items-center gap-1">
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
      </div>
      <div
        className={cn(
          'overflow-x-auto p-3.5 font-mono text-[12.5px] leading-relaxed',
          isLong && !isExpanded && 'overflow-hidden pb-12'
        )}
      >
        <HighlightedCode code={code} language={language} />
      </div>
      {incomplete && (
        <div className="flex items-center gap-1.5 px-3.5 pb-2 text-[11px] text-blue-500 font-mono">
          <span className="inline-block h-3 w-1.5 animate-pulse bg-blue-500" />
          <span>正在生成代码...</span>
        </div>
      )}
      {isLong && (
        <div
          className={cn(
            'border-t border-border/30 bg-muted/40 p-1 text-center',
            !isExpanded &&
              'absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/80 to-transparent pt-8'
          )}
        >
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer py-1 px-2.5 rounded-md hover:bg-muted/80 transition-colors"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
          >
            {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            <span>{isExpanded ? '收起代码' : `展开完整代码 (共 ${lineCount} 行)`}</span>
          </button>
        </div>
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
        className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground/85"
        {...props}
      >
        {children}
      </code>
    )
  },
  h1: ({ children, ...props }) => (
    <h1 className="mt-5 mb-2 text-lg font-semibold first:mt-0 last:mb-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="mt-4 mb-2 text-base font-semibold first:mt-0 last:mb-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="mt-3 mb-1.5 text-sm font-semibold first:mt-0 last:mb-0" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="my-2 leading-relaxed first:mt-0 last:mb-0" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="my-2 ms-5 list-disc marker:text-muted-foreground [&>li]:mt-1" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="my-2 ms-5 list-decimal marker:text-muted-foreground [&>li]:mt-1" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-relaxed" {...props}>
      {children}
    </li>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="my-2 border-s-2 border-border/80 ps-3.5 text-muted-foreground italic"
      {...props}
    >
      {children}
    </blockquote>
  ),
  hr: (props) => <hr className="my-4 border-border/40" {...props} />,
  table: ({ children, ...props }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full border-collapse text-left text-xs" {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th
      className="border-b border-border/60 bg-muted/60 px-3 py-2 font-medium text-foreground/85"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td
      className="border-b border-border/30 px-3 py-2 text-foreground/80 last:border-b-0"
      {...props}
    >
      {children}
    </td>
  )
}

interface MarkdownTextProps {
  text?: string
  children?: React.ReactNode
  className?: string
  isStreaming?: boolean
}

export const MarkdownText = memo(function MarkdownText({
  text,
  children,
  className,
  isStreaming = false
}: MarkdownTextProps): React.ReactNode {
  const content =
    typeof text === 'string'
      ? text
      : typeof children === 'string'
        ? children
        : children != null
          ? String(children)
          : ''
  if (!content) return null

  return (
    <Streamdown
      className={cn('chat-markdown aui-md leading-relaxed break-words text-[14px]', className)}
      components={components}
      controls={false}
      isAnimating={isStreaming}
      plugins={{ cjk }}
    >
      {content}
    </Streamdown>
  )
})

export const Markdown = MarkdownText
