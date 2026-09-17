import { ChevronDown, ListTodo } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { TodoList, type TodoItem } from '@renderer/components/assistant-ui/elements/todo-list'
import { cn } from '@renderer/lib/utils'
import { collapsePanel } from '@renderer/components/assistant-ui/elements/surfaces'
import type { ChatBlock, ToolBlock } from './types'
import { safeParseJson } from './tool-ui/types'

function extractLatestTodo(
  blocks: readonly ChatBlock[]
): { items: TodoItem[]; revision?: number } | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]
    if (block?.type !== 'tool') continue
    const tool = block as ToolBlock
    const name = (tool.name || '').toLowerCase()
    if (!name.includes('task') && !name.includes('todo') && !name.includes('plan')) continue

    const source = tool.output || tool.input
    if (!source) continue
    const parsed = safeParseJson(source)
    if (!parsed || typeof parsed !== 'object') continue

    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as Record<string, unknown>).tasks)
        ? (parsed as Record<string, unknown>).tasks
        : Array.isArray((parsed as Record<string, unknown>).todos)
          ? (parsed as Record<string, unknown>).todos
          : Array.isArray((parsed as Record<string, unknown>).steps)
            ? (parsed as Record<string, unknown>).steps
            : null

    if (Array.isArray(list) && list.length > 0) {
      const items: TodoItem[] = list.map((item, idx) => {
        if (typeof item === 'string') {
          return { id: String(idx), text: item, status: 'pending' as const }
        }
        const record = item as Record<string, unknown>
        const text = String(
          record.content || record.title || record.text || record.task || `任务 ${idx + 1}`
        )
        const rawStatus = String(record.status || record.state || '').toLowerCase()
        let status: TodoItem['status'] = 'pending'
        if (
          rawStatus === 'completed' ||
          rawStatus === 'done' ||
          rawStatus === 'success' ||
          record.completed === true
        ) {
          status = 'done'
        } else if (
          rawStatus === 'in_progress' ||
          rawStatus === 'running' ||
          rawStatus === 'active'
        ) {
          status = 'active'
        } else if (rawStatus === 'failed' || rawStatus === 'error') {
          status = 'failed'
        }
        return {
          id: String(record.id || idx),
          text,
          status,
          ...(typeof record.reason === 'string' ? { reason: record.reason } : {})
        }
      })
      return { items }
    }
  }
  return null
}

export function TodoPanel({ blocks }: { blocks: readonly ChatBlock[] }): React.ReactNode {
  const [open, setOpen] = useState(true)
  const todoSnapshot = useMemo(() => extractLatestTodo(blocks), [blocks])

  if (!todoSnapshot || todoSnapshot.items.length === 0) {
    return null
  }

  const { items, revision } = todoSnapshot
  const doneCount = items.filter((item) => item.status === 'done').length

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      // 样式钩子：本组件的内边距以 chat-ui.css 的无层规则（按此属性命中）为准，
      // 下面的 px-4 py-2 只作为兜底、数值需与之保持一致。
      // （历史原因：main.css 的无层 `*` 重置曾让所有 Tailwind 间距类失效，
      //  该重置现已在 @layer base 内，工具类恢复生效。）
      data-slot="todo-panel"
      className="w-full rounded-t-[inherit] border-b border-border/50 bg-background/80 px-4 py-2 text-xs backdrop-blur-sm transition-all"
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between py-1 text-muted-foreground hover:text-foreground cursor-pointer outline-none">
        <div className="flex items-center gap-2 font-medium">
          <ListTodo size={13} className="text-blue-500" />
          <span>任务待办清单</span>
          <span className="text-[11px] text-muted-foreground font-mono">
            ({doneCount}/{items.length})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <ChevronDown
            size={13}
            className={cn('transition-transform duration-200', open && 'rotate-180')}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className={cn('pt-2 pb-1', collapsePanel)}>
        <div className="max-h-48 overflow-y-auto pr-1">
          <TodoList items={items} revision={revision} showHeader={false} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
