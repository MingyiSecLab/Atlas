import { ChevronDown, ChevronUp, History, ListTodo } from 'lucide-react'
import { useState } from 'react'
import {
  TodoList,
  type TodoItem,
  type TodoStatus
} from '@renderer/components/assistant-ui/elements/todo-list'
import { ghostButton, mono, paper } from '@renderer/components/assistant-ui/elements/surfaces'
import { cn } from '@renderer/lib/utils'
import type { ToolBlock } from '../types'
import { safeParseJson, type ParsedToolCall } from './types'

export type TaskItemView = TodoItem

export interface TaskToolUIProps {
  block: ToolBlock
  parsed: ParsedToolCall
  /** 是否已被同回合中后续产生的最新清单取代 */
  isSuperseded?: boolean
  /** 当前清单在回合中的版本序号（从 1 开始） */
  versionIndex?: number
  /** 本回合任务清单的总迭代版本数 */
  totalVersions?: number
}

/**
 * 智能解析任务项：
 * 支持 tasks / todos / steps / plan / items / checklist 数组字段，
 * 也支持顶层数组或各种命名形式，全面兼容主流模型输出。
 */
function parseTaskItems(source?: string): TodoItem[] | null {
  if (!source) return null
  const trimmed = source.trim()
  if (!trimmed) return null

  // 1. 尝试 JSON 解析
  const parsed = safeParseJson(trimmed)
  if (parsed && typeof parsed === 'object') {
    const candidateList = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as Record<string, unknown>).tasks)
        ? (parsed as Record<string, unknown>).tasks
        : Array.isArray((parsed as Record<string, unknown>).todos)
          ? (parsed as Record<string, unknown>).todos
          : Array.isArray((parsed as Record<string, unknown>).steps)
            ? (parsed as Record<string, unknown>).steps
            : Array.isArray((parsed as Record<string, unknown>).plan)
              ? (parsed as Record<string, unknown>).plan
              : Array.isArray((parsed as Record<string, unknown>).items)
                ? (parsed as Record<string, unknown>).items
                : null

    if (Array.isArray(candidateList) && candidateList.length > 0) {
      const items: TodoItem[] = []
      for (let idx = 0; idx < candidateList.length; idx++) {
        const item = candidateList[idx]
        if (!item) continue
        if (typeof item === 'string') {
          const text = item.trim()
          if (text) items.push({ id: String(idx), text, status: 'pending' })
          continue
        }
        if (typeof item === 'object') {
          const record = item as Record<string, unknown>
          const text =
            typeof record.content === 'string'
              ? record.content
              : typeof record.title === 'string'
                ? record.title
                : typeof record.text === 'string'
                  ? record.text
                  : typeof record.task === 'string'
                    ? record.task
                    : typeof record.description === 'string'
                      ? record.description
                      : undefined
          if (!text) continue

          let status: TodoStatus = 'pending'
          const rawStatus = String(record.status ?? record.state ?? '').toLowerCase()
          if (
            rawStatus === 'completed' ||
            rawStatus === 'done' ||
            rawStatus === 'finished' ||
            rawStatus === 'success' ||
            record.completed === true ||
            record.done === true
          ) {
            status = 'done'
          } else if (
            rawStatus === 'in_progress' ||
            rawStatus === 'running' ||
            rawStatus === 'active' ||
            rawStatus === 'doing'
          ) {
            status = 'active'
          } else if (rawStatus === 'failed' || rawStatus === 'error') {
            status = 'failed'
          }

          items.push({
            id: typeof record.id === 'string' ? record.id : String(idx),
            text: text.trim(),
            status,
            ...(typeof record.reason === 'string' ? { reason: record.reason } : {})
          })
        }
      }
      if (items.length > 0) return items
    }
  }

  // 2. 尝试 Markdown 纯文本列表容错解析 (如 - [x] / - [ ] / ✓ / ○)
  const lines = trimmed.split('\n')
  const markdownItems: TodoItem[] = []
  let lineIndex = 0
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    lineIndex++
    // 匹配 - [x] 或 - [ ] 或 * [x] 等
    const checkMatch = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)$/)
    if (checkMatch) {
      markdownItems.push({
        id: `line-${lineIndex}`,
        text: checkMatch[2].trim(),
        status: checkMatch[1].toLowerCase() === 'x' ? 'done' : 'pending'
      })
      continue
    }
    // 匹配 ✓ 或 ○ 或 ↻ 前缀
    if (line.startsWith('✓') || line.startsWith('✔') || line.startsWith('✅')) {
      markdownItems.push({
        id: `line-${lineIndex}`,
        text: line.replace(/^[✓✔✅]\s*/, '').trim(),
        status: 'done'
      })
      continue
    }
    if (line.startsWith('↻') || line.startsWith('⏳') || line.startsWith('▶')) {
      markdownItems.push({
        id: `line-${lineIndex}`,
        text: line
          .replace(/^[↻⏳▶]\s*/, '')
          .replace(/进行中$/, '')
          .trim(),
        status: 'active'
      })
      continue
    }
    if (line.startsWith('○') || line.startsWith('•') || line.startsWith('-')) {
      markdownItems.push({
        id: `line-${lineIndex}`,
        text: line.replace(/^[○•-]\s*/, '').trim(),
        status: 'pending'
      })
      continue
    }
  }

  return markdownItems.length > 0 ? markdownItems : null
}

/**
 * 现代高质感 Task / Todo 清单组件（使用 Assistant-UI TodoList 原生元素）
 * 支持 Living Working List：同一回合内被新版本取代的前序清单可自动微缩折叠，
 * 末位最新清单全面展开，彻底避免长程多步 Agent 任务中多卡片霸屏。
 */
export function TaskToolUI({
  block,
  parsed,
  isSuperseded = false,
  versionIndex,
  totalVersions
}: TaskToolUIProps): React.ReactNode {
  const [isManualExpanded, setIsManualExpanded] = useState(false)
  const items = parseTaskItems(block.output) ?? parseTaskItems(block.input)

  if (!items || items.length === 0) {
    return (
      <div
        className={cn(
          paper,
          'flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl p-4 text-center text-xs text-foreground/45'
        )}
      >
        <div className="flex items-center gap-1.5 font-medium text-foreground/65">
          <ListTodo size={14} className="text-blue-500" />
          <span>{parsed.displayName || '任务清单'}</span>
        </div>
        <p>暂无任务细项</p>
      </div>
    )
  }

  const completedCount = items.filter((item) => item.status === 'done').length
  const totalCount = items.length

  // 若已被后续最新版本取代，且用户未手动展开：呈现微缩折叠胶囊行
  if (isSuperseded && !isManualExpanded) {
    return (
      <div className="w-full">
        <button
          type="button"
          className={cn(
            paper,
            'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs transition-colors hover:bg-foreground/[0.04] cursor-pointer'
          )}
          onClick={() => setIsManualExpanded(true)}
          aria-expanded={false}
          title="点击展开查看此历史阶段的清单快照"
        >
          <div className="flex min-w-0 items-center gap-2 text-foreground/75">
            <History size={13} className="text-foreground/45 shrink-0" />
            <span className="truncate font-medium">
              任务清单快照 {versionIndex ? `(第 ${versionIndex} 版)` : ''}
            </span>
            <span className={cn(mono, 'text-foreground/40 tabular-nums shrink-0')}>
              {completedCount}/{totalCount} 完成
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-foreground/45">
            <span className="rounded bg-foreground/[0.05] px-1.5 py-0.5 text-foreground/40">
              已被后续版本取代
            </span>
            <ChevronDown size={13} />
          </div>
        </button>
      </div>
    )
  }

  const title =
    totalVersions && totalVersions > 1
      ? isSuperseded
        ? `任务执行计划 (历史快照 ${versionIndex ?? 1}/${totalVersions})`
        : `任务执行计划 (最新版本 · 第 ${versionIndex ?? totalVersions} 次迭代)`
      : parsed.displayName || '任务执行计划'

  return (
    <div
      className={cn(
        paper,
        'relative w-full max-w-full rounded-2xl p-4 transition-all',
        isSuperseded && 'border-dashed opacity-85 hover:opacity-100'
      )}
    >
      {isSuperseded ? (
        <div className="mb-2 flex items-center justify-between border-b border-border/40 pb-2 text-xs text-foreground/50">
          <span className="flex items-center gap-1.5 font-medium">
            <History size={12} />
            <span>历史快照</span>
          </span>
          <button
            type="button"
            className={cn(ghostButton, 'size-6 p-0 text-foreground/45 hover:text-foreground')}
            onClick={() => setIsManualExpanded(false)}
            title="收起历史快照"
            aria-label="收起历史快照"
          >
            <ChevronUp size={13} />
          </button>
        </div>
      ) : null}

      <TodoList items={items} revision={versionIndex} title={title} className="max-w-none" />
    </div>
  )
}
