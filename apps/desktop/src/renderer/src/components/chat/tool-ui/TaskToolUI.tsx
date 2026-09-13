import { Check, Circle, Loader2 } from 'lucide-react'
import type { ToolBlock } from '../types'
import { safeParseJson, type ParsedToolCall } from './types'

interface TaskItemView {
  id?: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

function parseTaskItems(source?: string): TaskItemView[] | null {
  if (!source) return null
  const parsed = safeParseJson(source)
  const tasks = parsed?.tasks
  if (!Array.isArray(tasks)) return null
  const items: TaskItemView[] = []
  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue
    const record = task as Record<string, unknown>
    const content = typeof record.content === 'string' ? record.content : undefined
    if (!content) continue
    const status =
      record.status === 'completed' || record.status === 'in_progress' || record.status === 'pending'
        ? record.status
        : 'pending'
    items.push({
      ...(typeof record.id === 'string' ? { id: record.id } : {}),
      content,
      status
    })
  }
  return items
}

/**
 * 内置任务跟踪工具（task_write / task_update / task_complete / task_check）的
 * Codex 式计划清单渲染。优先读结果中的任务列表，回退到调用参数。
 */
export function TaskToolUI({
  block,
  parsed
}: {
  block: ToolBlock
  parsed: ParsedToolCall
}): React.ReactNode {
  const items = parseTaskItems(block.output) ?? parseTaskItems(block.input)

  if (!items || items.length === 0) {
    return (
      <div className="aui-task-container">
        <div className="aui-task-empty">{parsed.displayName}</div>
      </div>
    )
  }

  const completed = items.filter((item) => item.status === 'completed').length

  return (
    <div className="aui-task-container">
      <div className="aui-task-list" role="list">
        {items.map((item, index) => (
          <div
            key={item.id ?? `task-${index}`}
            className={`aui-task-item is-${item.status}`}
            role="listitem"
          >
            <span className="aui-task-state" aria-hidden="true">
              {item.status === 'completed' ? (
                <Check size={12} />
              ) : item.status === 'in_progress' ? (
                <Loader2 size={12} className="aui-task-spin" />
              ) : (
                <Circle size={12} />
              )}
            </span>
            <span className={item.status === 'completed' ? 'aui-task-content is-done' : 'aui-task-content'}>
              {item.content}
            </span>
            {item.status === 'in_progress' ? <span className="aui-task-active-tag">进行中</span> : null}
          </div>
        ))}
      </div>
      <div className="aui-task-progress">
        {completed}/{items.length} 已完成
      </div>
    </div>
  )
}
