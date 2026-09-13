import { Globe, Search } from 'lucide-react'
import type { ToolBlock } from '../types'
import { HighlightedCode } from '../HighlightedCode'
import type { ParsedToolCall } from './types'

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
    <div className="aui-search-container">
      {/* Search Meta Query Bar */}
      <div className="aui-search-meta-bar">
        <div className="aui-search-query-pill">
          {isWeb ? <Globe size={13} /> : <Search size={13} />}
          <span className="aui-search-query-text">{query || '无搜索词'}</span>
        </div>

        {domain ? (
          <span className="aui-search-tag" title="限定域名">
            {domain}
          </span>
        ) : null}

        {searchPath ? (
          <span className="aui-search-tag" title="搜索路径">
            {searchPath.split('/').pop()}
          </span>
        ) : null}

        {isRegex ? <span className="aui-search-tag-accent">Regex</span> : null}
        {caseInsensitive ? <span className="aui-search-tag-accent">Aa</span> : null}
      </div>

      {/* Search Result Output */}
      {output ? (
        <div className="aui-search-result-section">
          <div className="aui-search-result-label">
            <span>搜索结果</span>
            {block.outputTruncated ? <small>（部分匹配）</small> : null}
          </div>
          <div className="aui-search-result-content">
            <HighlightedCode code={output} language={isWeb ? 'markdown' : 'shell'} />
          </div>
        </div>
      ) : block.status === 'running' ? (
        <div className="aui-search-running">正在检索内容...</div>
      ) : null}
    </div>
  )
}
