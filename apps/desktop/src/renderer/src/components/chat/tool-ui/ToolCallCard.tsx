import { FileCode, ListChecks, Search, ShieldCheck, Terminal, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Disclosure } from '../Disclosure'
import type { ToolBlock } from '../types'
import { DefaultToolUI } from './DefaultToolUI'
import { FileOpToolUI } from './FileOpToolUI'
import { PentestToolUI } from './PentestToolUI'
import { SearchToolUI } from './SearchToolUI'
import { TaskToolUI } from './TaskToolUI'
import { TerminalToolUI } from './TerminalToolUI'
import { analyzeToolCall } from './types'

interface ToolCallCardProps {
  block: ToolBlock
  defaultOpen?: boolean
  isSuperseded?: boolean
  versionIndex?: number
  totalVersions?: number
}

export function ToolCallCard({
  block,
  defaultOpen = false,
  isSuperseded = false,
  versionIndex,
  totalVersions
}: ToolCallCardProps): React.ReactNode {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const parsed = useMemo(() => analyzeToolCall(block), [block])
  const hasContent = Boolean(block.input || block.output || block.outputArtifact)

  const icon = useMemo(() => {
    switch (parsed.category) {
      case 'terminal':
        return <Terminal size={14} className="aui-step-cat-icon is-terminal" />
      case 'file_op':
        return <FileCode size={14} className="aui-step-cat-icon is-file" />
      case 'search':
        return <Search size={14} className="aui-step-cat-icon is-search" />
      case 'security':
        return <ShieldCheck size={14} className="aui-step-cat-icon is-security" />
      case 'task':
        return <ListChecks size={14} className="aui-step-cat-icon is-task" />
      case 'general':
      default:
        return <Wrench size={14} className="aui-step-cat-icon is-general" />
    }
  }, [parsed.category])

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
      case 'task':
        return (
          <TaskToolUI
            block={block}
            parsed={parsed}
            isSuperseded={isSuperseded}
            versionIndex={versionIndex}
            totalVersions={totalVersions}
          />
        )
      case 'general':
      default:
        return <DefaultToolUI block={block} parsed={parsed} />
    }
  }

  const title = parsed.displayName || block.name
  const summary =
    parsed.primaryParam || block.summary || (block.status === 'success' ? '执行完成' : undefined)
  const tone = block.status === 'error' || block.status === 'denied' ? 'error' : 'default'

  // 对于已被后续版本取代的任务清单，直接作为独立微型胶囊条呈现，避免双层折叠嵌套
  if (parsed.category === 'task' && isSuperseded) {
    return (
      <div className="chat-single-tool-text-wrapper">
        <TaskToolUI
          block={block}
          parsed={parsed}
          isSuperseded={isSuperseded}
          versionIndex={versionIndex}
          totalVersions={totalVersions}
        />
      </div>
    )
  }

  return (
    <div className="chat-single-tool-text-wrapper">
      <Disclosure
        open={isOpen}
        onToggle={() => setIsOpen((prev) => !prev)}
        icon={icon}
        title={title}
        summary={summary}
        running={block.status === 'running'}
        tone={tone}
      >
        {hasContent ? <div className="aui-single-tool-body">{renderToolBody()}</div> : null}
      </Disclosure>
    </div>
  )
}
