import type { HighlightResult } from '@streamdown/code'
import { createCodePlugin } from '@streamdown/code'
import { useEffect, useState } from 'react'
import type { BundledLanguage } from 'streamdown'

const highlighter = createCodePlugin({ themes: ['github-light', 'github-dark'] })

interface HighlightedState {
  code: string
  language: BundledLanguage
  result: HighlightResult
}

export function HighlightedCode({
  code,
  language
}: {
  code: string
  language?: string
}): React.ReactNode {
  const normalized = language?.trim().toLowerCase() as BundledLanguage | undefined
  const supported = normalized && highlighter.supportsLanguage(normalized) ? normalized : null
  const [highlighted, setHighlighted] = useState<HighlightedState | null>(null)

  useEffect(() => {
    if (!supported) return
    let active = true
    const apply = (result: HighlightResult): void => {
      if (active) setHighlighted({ code, language: supported, result })
    }
    const immediate = highlighter.highlight(
      { code, language: supported, themes: ['github-light', 'github-dark'] },
      apply
    )
    if (immediate) apply(immediate)
    return () => {
      active = false
    }
  }, [code, supported])

  const result =
    highlighted?.code === code && highlighted.language === supported ? highlighted.result : null

  return (
    <pre className="chat-code-pre" data-language={language}>
      <code>
        {result
          ? result.tokens.map((line, lineIndex) => (
              <span key={lineIndex}>
                {line.map((token, tokenIndex) => (
                  <span
                    key={`${token.offset ?? tokenIndex}-${token.content}`}
                    style={{
                      color: token.color,
                      backgroundColor: token.bgColor,
                      ...token.htmlStyle
                    }}
                    {...token.htmlAttrs}
                  >
                    {token.content}
                  </span>
                ))}
                {lineIndex < result.tokens.length - 1 ? '\n' : null}
              </span>
            ))
          : code}
      </code>
    </pre>
  )
}
