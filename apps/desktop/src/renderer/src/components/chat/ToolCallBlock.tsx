import {
  CircleCheck,
  CircleX,
  FileText,
  LoaderCircle,
  ShieldQuestion,
  Terminal
} from 'lucide-react'
import { useState } from 'react'
import { Disclosure } from './Disclosure'
import { HighlightedCode } from './HighlightedCode'
import type { ToolBlock } from './types'
import { SkillMessage } from './skills/SkillMessage'

function skillName(input: string | undefined): string | undefined {
  if (!input) return undefined
  try {
    const parsed = JSON.parse(input) as { name?: unknown }
    return typeof parsed.name === 'string' ? parsed.name : undefined
  } catch {
    return undefined
  }
}

function ToolIcon({ status }: { status: ToolBlock['status'] }): React.ReactNode {
  if (status === 'running' || status === 'pending') {
    return <LoaderCircle className="is-spinning" size={14} />
  }
  if (status === 'waiting_approval') return <ShieldQuestion size={14} />
  if (status === 'denied') return <CircleX size={14} />
  if (status === 'error') return <CircleX size={14} />
  if (status === 'success') return <CircleCheck size={14} />
  return <Terminal size={14} />
}

function statusLabel(status: ToolBlock['status']): string {
  if (status === 'pending') return '等待执行'
  if (status === 'running') return '执行中'
  if (status === 'waiting_approval') return '等待批准'
  if (status === 'denied') return '已拒绝'
  if (status === 'error') return '执行失败'
  return '已完成'
}

export function ToolCallBlock({ block }: { block: ToolBlock }): React.ReactNode {
  const [open, setOpen] = useState(false)
  const hasContent = Boolean(block.input || block.output || block.outputArtifact)
  const activatedSkill = block.name === 'skill' ? skillName(block.input) : undefined

  if (activatedSkill && block.output) {
    return (
      <SkillMessage skill={{ type: 'skill', name: activatedSkill, instructions: block.output }} />
    )
  }

  return (
    <Disclosure
      open={open}
      onToggle={() => setOpen((value) => !value)}
      icon={<ToolIcon status={block.status} />}
      title={block.name}
      summary={block.summary || statusLabel(block.status)}
      running={block.status === 'running' || block.status === 'pending'}
      tone={block.status === 'error' || block.status === 'denied' ? 'error' : 'default'}
    >
      {hasContent ? (
        <div className="chat-tool-body">
          {block.input ? (
            <section>
              <div className="chat-tool-label">输入</div>
              <HighlightedCode code={block.input} language="shell" />
            </section>
          ) : null}
          {block.output ? (
            <section>
              <div className="chat-tool-label">输出{block.outputTruncated ? '（摘要）' : ''}</div>
              <HighlightedCode code={block.output} language="text" />
            </section>
          ) : null}
          {block.outputArtifact ? (
            <section className="chat-tool-artifact">
              <div className="chat-tool-artifact-heading">
                <div>
                  <FileText size={14} />
                  <span>保存的输出</span>
                  <small>{Math.ceil(block.outputArtifact.sizeBytes / 1024)} KB</small>
                </div>
              </div>
              {block.outputCaptureTruncated ? (
                <p className="chat-tool-artifact-notice">输出超过保存上限，Artifact 已截断。</p>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : undefined}
    </Disclosure>
  )
}
