import { cjk } from '@streamdown/cjk'
import { isValidElement } from 'react'
import type { Components } from 'streamdown'
import { Streamdown, useIsCodeFenceIncomplete } from 'streamdown'
import { CodeBlock } from './CodeBlock'

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
  return (
    <CodeBlock
      code={getFenceText(children).replace(/\n+$/, '')}
      language={language}
      incomplete={incomplete}
    />
  )
}

function MarkdownLink({
  children,
  href,
  node,
  ...props
}: React.ComponentProps<'a'> & { node?: unknown }): React.ReactNode {
  void node
  return (
    <a href={href} target="_blank" rel="noreferrer" {...props}>
      {children}
    </a>
  )
}

const components: Components = {
  a: MarkdownLink,
  code: FencedCode,
  inlineCode: ({ children, node, ...props }) => {
    void node
    return <code {...props}>{children}</code>
  }
}

export function Markdown({
  children,
  isStreaming = false
}: {
  children?: string
  isStreaming?: boolean
}): React.ReactNode {
  void isStreaming
  const content = typeof children === 'string' ? children : String(children ?? '')
  if (!content) return null

  return (
    <Streamdown
      className="chat-markdown"
      components={components}
      controls={false}
      isAnimating={false}
      plugins={{ cjk }}
    >
      {content}
    </Streamdown>
  )
}
