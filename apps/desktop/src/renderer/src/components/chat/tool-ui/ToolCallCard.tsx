import { useMemo, useState } from 'react'
import type { ToolBlock } from '../types'
import { DefaultToolUI } from './DefaultToolUI'
import { FileOpToolUI } from './FileOpToolUI'
import { PentestToolUI } from './PentestToolUI'
import { SearchToolUI } from './SearchToolUI'
import { TerminalToolUI } from './TerminalToolUI'
import { ToolHeader } from './ToolHeader'
import { analyzeToolCall } from './types'

interface ToolCallCardProps {
  block: ToolBlock
  defaultOpen?: boolean
}

export function ToolCallCard({ block, defaultOpen = false }: ToolCallCardProps): React.ReactNode {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const parsed = useMemo(() => analyzeToolCall(block), [block])
  const hasContent = Boolean(block.input || block.output || block.outputArtifact)

  const renderToolBody = (): React.ReactNode => {
    switch (parsed.category) {
      case 'terminal':
        return <TerminalToolUI block={block} parsed={parsed} />
      case 'file_op':
        return <FileOpToolUI block={block} parsed={parsed} />
      case 'search':
        return <SearchToolUI block={block} parsed={parsed} />
      case 'security':
        return <PentestToolUI block={block} parsed={parsed} />
      case 'general':
      default:
        return <DefaultToolUI block={block} parsed={parsed} />
    }
  }

  return (
    <div
      className={`aui-tool-card ${isOpen ? 'is-open' : 'is-collapsed'} status-${block.status}`}
      data-tool-name={block.name}
      data-status={block.status}
    >
      <ToolHeader
        block={block}
        parsed={parsed}
        isOpen={isOpen}
        onToggle={() => setIsOpen((prev) => !prev)}
        hasContent={hasContent}
      />

      {isOpen && hasContent ? <div className="aui-tool-card-body">{renderToolBody()}</div> : null}
    </div>
  )
}
