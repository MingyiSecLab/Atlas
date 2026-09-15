import 'streamdown/styles.css'
import 'katex/dist/katex.min.css'

import type { TextMessagePartProps } from '@assistant-ui/react'
import {
  StreamdownTextPrimitive,
  type StreamdownTextPrimitiveProps,
  type StreamdownTextComponents,
  type CodeHeaderProps,
  useIsStreamdownCodeBlock
} from '@assistant-ui/react-streamdown'
import { Streamdown, type StreamdownProps } from 'streamdown'
import { code } from '@streamdown/code'
import { math } from '@streamdown/math'
import { mermaid } from '@streamdown/mermaid'
import { cjk } from '@streamdown/cjk'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { type FC, memo, useMemo, useRef } from 'react'
import { useCopyFeedback } from '@renderer/components/chat/useCopyFeedback'
import { TooltipIconButton } from './tooltip-icon-button'
import { cn } from '@renderer/lib/utils'

const defaultStreamdownPlugins = {
  code,
  math,
  mermaid,
  cjk
}

/* eslint-disable react-hooks/refs */
const useShallowStable = <T extends Record<string, unknown> | undefined>(value: T): T => {
  const ref = useRef(value)
  if (value !== ref.current) {
    const prev = ref.current
    const stable =
      value !== undefined &&
      prev !== undefined &&
      Object.keys(prev).length === Object.keys(value).length &&
      Object.keys(value).every((key) => prev[key] === value[key])
    if (!stable) ref.current = value
  }
  return ref.current
}
/* eslint-enable react-hooks/refs */

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { copied, copy } = useCopyFeedback()
  const onCopy = (): void => {
    if (!code || copied) return
    copy(code)
  }

  return (
    <div className="aui-code-header-root border-border/50 bg-muted/50 mt-3 flex items-center justify-between rounded-t-xl border border-b-0 px-3.5 py-1.5 text-xs">
      <span className="aui-code-header-language text-muted-foreground font-medium lowercase">
        {language || 'text'}
      </span>
      <TooltipIconButton tooltip={copied ? '已复制' : '复制代码'} onClick={onCopy}>
        {!copied && <CopyIcon className="animate-in zoom-in-75 fade-in duration-150 size-3.5" />}
        {copied && (
          <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out size-3.5 text-emerald-500" />
        )}
      </TooltipIconButton>
    </div>
  )
}

const defaultComponents = {
  CodeHeader,
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        'aui-md-h1 mt-5 mb-2 scroll-m-20 text-xl font-semibold first:mt-0 last:mb-0',
        className
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        'aui-md-h2 mt-5 mb-2 scroll-m-20 text-lg font-semibold first:mt-0 last:mb-0',
        className
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn(
        'aui-md-h3 mt-4 mb-1.5 scroll-m-20 text-base font-semibold first:mt-0 last:mb-0',
        className
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn(
        'aui-md-h4 mt-3.5 mb-1 scroll-m-20 text-base font-medium first:mt-0 last:mb-0',
        className
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      className={cn('aui-md-h5 mt-3 mb-1 text-sm font-semibold first:mt-0 last:mb-0', className)}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn('aui-md-h6 mt-3 mb-1 text-sm font-medium first:mt-0 last:mb-0', className)}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn('aui-md-p my-(--density-gap) leading-relaxed first:mt-0 last:mb-0', className)}
      {...props}
    />
  ),
  a: ({ className, href, children, ...props }) => {
    const normalizedHref = href
      ?.trim()
      .split('')
      .filter((character) => {
        const codePoint = character.charCodeAt(0)
        return codePoint > 0x1f && codePoint !== 0x7f
      })
      .join('')
      .toLowerCase()
    if (
      !normalizedHref ||
      normalizedHref.startsWith('javascript:') ||
      normalizedHref.startsWith('vbscript:')
    ) {
      return <span>{children} [blocked]</span>
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cn(
          'aui-md-a text-primary hover:text-primary/80 underline underline-offset-2 transition-colors',
          className
        )}
        {...props}
      >
        {children}
      </a>
    )
  },
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        'aui-md-blockquote border-muted-foreground/30 text-muted-foreground my-(--density-gap) border-s-2 ps-4',
        className
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn(
        'aui-md-ul marker:text-muted-foreground my-(--density-gap) ps-6 list-outside list-disc space-y-1 [&_ul]:my-1 [&_ul]:ps-5 [&_ol]:my-1 [&_ol]:ps-5',
        className
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn(
        'aui-md-ol marker:text-muted-foreground my-(--density-gap) ps-6.5 list-outside list-decimal space-y-1 [&_ul]:my-1 [&_ul]:ps-5 [&_ol]:my-1 [&_ol]:ps-5',
        className
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li
      className={cn(
        'aui-md-li leading-relaxed text-foreground/90 ps-1 [&>p]:inline [&>p]:my-0',
        className
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr
      className={cn('aui-md-hr border-muted-foreground/20 my-(--density-gap)', className)}
      {...props}
    />
  ),
  table: ({ className, ...props }) => (
    <div className="aui-md-table-wrapper my-(--density-gap) overflow-x-auto">
      <table
        className={cn('aui-md-table w-full border-separate border-spacing-0', className)}
        {...props}
      />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        'aui-md-th bg-muted px-3 py-1.5 text-start font-medium first:rounded-ss-lg last:rounded-se-lg [[align=center]]:text-center [[align=right]]:text-right',
        className
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        'aui-md-td border-muted-foreground/20 border-s border-b px-3 py-1.5 text-start last:border-e [[align=center]]:text-center [[align=right]]:text-right',
        className
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }) => (
    <tr
      className={cn(
        'aui-md-tr m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-es-lg [&:last-child>td:last-child]:rounded-ee-lg',
        className
      )}
      {...props}
    />
  ),
  strong: ({ className, ...props }) => (
    <strong className={cn('aui-md-strong font-semibold', className)} {...props} />
  ),
  sup: ({ className, ...props }) => (
    <sup className={cn('aui-md-sup [&>a]:text-xs [&>a]:no-underline', className)} {...props} />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        'aui-md-pre border-border/50 bg-muted/30 overflow-x-auto rounded-t-none rounded-b-xl border border-t-0 p-3.5 text-[0.93em] leading-relaxed',
        className
      )}
      {...props}
    />
  ),
  code: function Code({ className, ...props }) {
    const isCodeBlock = useIsStreamdownCodeBlock()
    return (
      <code
        className={cn(
          !isCodeBlock &&
            'aui-md-inline-code bg-muted rounded-md px-1.5 py-0.5 font-mono text-[0.85em]',
          className
        )}
        {...props}
      />
    )
  }
} as unknown as StreamdownTextComponents

export type MarkdownTextProps = Partial<TextMessagePartProps> &
  Omit<StreamdownTextPrimitiveProps, 'children'> & {
    className?: string
    components?: StreamdownTextComponents
  }

export const MarkdownText: FC<MarkdownTextProps> = memo(function MarkdownText({
  className,
  components,
  plugins = defaultStreamdownPlugins,
  shikiTheme = ['github-light', 'github-dark'],
  caret = 'block',
  defer = true,
  ...restProps
}: MarkdownTextProps): React.ReactNode {
  const stableComponents = useShallowStable(components)
  const mergedComponents = useMemo(() => {
    if (!stableComponents) return defaultComponents
    return {
      ...defaultComponents,
      ...stableComponents
    }
  }, [stableComponents])

  return (
    <StreamdownTextPrimitive
      plugins={plugins}
      shikiTheme={shikiTheme}
      caret={caret}
      defer={defer}
      className={cn('chat-markdown aui-md leading-relaxed break-words text-[14px]', className)}
      components={mergedComponents}
      {...restProps}
    />
  )
})

export interface StandaloneMarkdownProps extends Partial<Omit<StreamdownProps, 'children'>> {
  text?: string
  children?: React.ReactNode
  className?: string
  isStreaming?: boolean
}

export const Markdown: FC<StandaloneMarkdownProps> = memo(function Markdown({
  text,
  children,
  className,
  isStreaming = false,
  plugins = defaultStreamdownPlugins,
  shikiTheme = ['github-light', 'github-dark'],
  caret,
  components,
  ...restProps
}: StandaloneMarkdownProps): React.ReactNode {
  const stableComponents = useShallowStable(components)
  const mergedComponents = useMemo(() => {
    if (!stableComponents) return defaultComponents
    return {
      ...defaultComponents,
      ...stableComponents
    }
  }, [stableComponents])

  const content =
    typeof text === 'string'
      ? text
      : typeof children === 'string'
        ? children
        : children != null
          ? String(children)
          : ''
  if (!content) return null

  const resolvedCaret = caret ?? (isStreaming ? 'block' : undefined)

  return (
    <div
      className={cn('chat-markdown aui-md leading-relaxed break-words text-[14px]', className)}
      data-status={isStreaming ? 'running' : 'complete'}
    >
      <Streamdown
        plugins={plugins}
        shikiTheme={shikiTheme}
        caret={resolvedCaret}
        components={mergedComponents as StreamdownProps['components']}
        {...restProps}
      >
        {content}
      </Streamdown>
    </div>
  )
})
