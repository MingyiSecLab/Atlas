import { Globe, Loader2, Search } from 'lucide-react'
import type { ToolBlock } from '../types'
import { HighlightedCode } from '../HighlightedCode'
import type { ParsedToolCall } from './types'
import { paper } from '@renderer/components/assistant-ui/elements/surfaces'
import { cn } from '@renderer/lib/utils'

interface SearchToolUIProps {
  block: ToolBlock
  parsed: ParsedToolCall
}

export function SearchToolUI({ block, parsed }: SearchToolUIProps): React.ReactNode {
  const args = parsed.parsedArgs
  const query = parsed.searchQuery || ''
  const domain = args?.domain as string | undefined
  const searchPath = args?.SearchPath as string | undefined
  const isRegex = args?.IsRegex as boolean | undefined
  const caseInsensitive = args?.CaseInsensitive as boolean | undefined
  const isWeb = block.name.includes('web')
  const output = block.output || ''

  return (
    <div className="flex flex-col gap-2.5 p-1 text-xs">
      {/* Search Meta Query Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-[11.5px] font-mono text-foreground/90 max-w-[85%]">
          {isWeb ? (
            <Globe size={13} className="text-primary shrink-0" />
          ) : (
            <Search size={13} className="text-primary shrink-0" />
          )}
          <span className="truncate font-medium">{query || '无搜索词'}</span>
        </div>

        {domain ? (
          <span
            className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground font-mono"
            title="限定域名"
          >
            {domain}
          </span>
        ) : null}

        {searchPath ? (
          <span
            className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground font-mono"
            title="搜索路径"
          >
            {searchPath.split('/').pop()}
          </span>
        ) : null}

        {isRegex ? (
          <span className="rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 text-[10px] font-mono font-medium">
            Regex
          </span>
        ) : null}
        {caseInsensitive ? (
          <span className="rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 text-[10px] font-mono font-medium">
            Aa
          </span>
        ) : null}
      </div>

      {/* Search Result Output */}
      {output ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            <span>搜索结果</span>
            {block.outputTruncated ? (
              <small className="text-muted-foreground/60 font-normal lowercase tracking-normal">
                （部分匹配）
              </small>
            ) : null}
          </div>
          <div className={cn(paper, 'rounded-xl overflow-hidden')}>
            <div className="max-h-72 overflow-auto p-3 font-mono text-[11.5px] leading-relaxed">
              <HighlightedCode code={output} language={isWeb ? 'markdown' : 'shell'} />
            </div>
          </div>
        </div>
      ) : block.status === 'running' ? (
        <div className="flex items-center gap-2 py-2 text-muted-foreground">
          <Loader2 size={13} className="animate-spin text-primary" />
          <span className="text-xs">正在检索匹配内容...</span>
        </div>
      ) : null}
    </div>
  )
}
