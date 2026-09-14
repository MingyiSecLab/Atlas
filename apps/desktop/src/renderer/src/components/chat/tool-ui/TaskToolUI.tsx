import { Check, ChevronDown, ChevronUp, Circle, History, ListTodo, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { ToolBlock } from '../types'
import { safeParseJson, type ParsedToolCall } from './types'

export interface TaskItemView {
  id?: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

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
function parseTaskItems(source?: string): TaskItemView[] | null {
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
      const items: TaskItemView[] = []
      for (const item of candidateList) {
        if (!item) continue
        if (typeof item === 'string') {
          const content = item.trim()
          if (content) items.push({ content, status: 'pending' })
          continue
        }
        if (typeof item === 'object') {
          const record = item as Record<string, unknown>
          const content =
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
          if (!content) continue

          let status: 'pending' | 'in_progress' | 'completed' = 'pending'
          const rawStatus = String(record.status ?? record.state ?? '').toLowerCase()
          if (
            rawStatus === 'completed' ||
            rawStatus === 'done' ||
            rawStatus === 'finished' ||
            rawStatus === 'success' ||
            record.completed === true ||
            record.done === true
          ) {
            status = 'completed'
          } else if (
            rawStatus === 'in_progress' ||
            rawStatus === 'running' ||
            rawStatus === 'active' ||
            rawStatus === 'doing'
          ) {
            status = 'in_progress'
          }

          items.push({
            ...(typeof record.id === 'string' ? { id: record.id } : {}),
            content: content.trim(),
            status
          })
        }
      }
      if (items.length > 0) return items
    }
  }

  // 2. 尝试 Markdown 纯文本列表容错解析 (如 - [x] / - [ ] / ✓ / ○)
  const lines = trimmed.split('\n')
  const markdownItems: TaskItemView[] = []
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    // 匹配 - [x] 或 - [ ] 或 * [x] 等
    const checkMatch = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)$/)
    if (checkMatch) {
      markdownItems.push({
        content: checkMatch[2].trim(),
        status: checkMatch[1].toLowerCase() === 'x' ? 'completed' : 'pending'
      })
      continue
    }
    // 匹配 ✓ 或 ○ 或 ↻ 前缀
    if (line.startsWith('✓') || line.startsWith('✔') || line.startsWith('✅')) {
      markdownItems.push({
        content: line.replace(/^[✓✔✅]\s*/, '').trim(),
        status: 'completed'
      })
      continue
    }
    if (line.startsWith('↻') || line.startsWith('⏳') || line.startsWith('▶')) {
      markdownItems.push({
        content: line
          .replace(/^[↻⏳▶]\s*/, '')
          .replace(/进行中$/, '')
          .trim(),
        status: 'in_progress'
      })
      continue
    }
    if (line.startsWith('○') || line.startsWith('•') || line.startsWith('-')) {
      markdownItems.push({
        content: line.replace(/^[○•-]\s*/, '').trim(),
        status: 'pending'
      })
      continue
    }
  }

  return markdownItems.length > 0 ? markdownItems : null
}

/**
 * 现代高质感 Task / Todo 清单组件（参考 Cursor / Codex 设计）
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
      <div className="aui-task-card">
        <div className="aui-task-header">
          <div className="aui-task-title-group">
            <ListTodo size={13} className="aui-task-header-icon" />
            <span className="aui-task-title">{parsed.displayName || '任务清单'}</span>
          </div>
        </div>
        <div className="aui-task-empty">暂无任务细项</div>
      </div>
    )
  }

  const completedCount = items.filter((item) => item.status === 'completed').length
  const totalCount = items.length
  const progressPercent = Math.round((completedCount / totalCount) * 100)
  const isAllDone = completedCount === totalCount

  // 若已被后续最新版本取代，且用户未手动展开：呈现微缩折叠胶囊行
  if (isSuperseded && !isManualExpanded) {
    return (
      <div className="aui-task-superseded-pill">
        <button
          type="button"
          className="aui-task-superseded-trigger"
          onClick={() => setIsManualExpanded(true)}
          aria-expanded={false}
          title="点击展开查看此历史阶段的清单快照"
        >
          <div className="aui-task-superseded-left">
            <History size={12} className="aui-task-superseded-icon" />
            <span className="aui-task-superseded-title">
              任务清单快照 {versionIndex ? `(第 ${versionIndex} 版)` : ''}
            </span>
            <span className="aui-task-superseded-progress">
              {completedCount}/{totalCount} 完成
            </span>
          </div>
          <div className="aui-task-superseded-right">
            <span className="aui-task-superseded-tag">已被后续版本取代</span>
            <ChevronDown size={12} className="aui-task-superseded-chevron" />
          </div>
        </button>
      </div>
    )
  }

  return (
    <div
      className={`aui-task-card ${isAllDone ? 'is-all-completed' : ''} ${
        isSuperseded ? 'is-superseded-expanded' : ''
      }`}
    >
      {/* 头部摘要与进度徽标 */}
      <div className="aui-task-header">
        <div className="aui-task-title-group">
          <ListTodo size={13.5} className="aui-task-header-icon" />
          <span className="aui-task-title">任务执行计划</span>
          {totalVersions && totalVersions > 1 ? (
            <span className={`aui-task-version-badge ${isSuperseded ? 'is-history' : 'is-latest'}`}>
              {isSuperseded
                ? `历史快照 (${versionIndex ?? 1}/${totalVersions})`
                : `最新版本 · 第 ${versionIndex ?? totalVersions} 次迭代`}
            </span>
          ) : null}
        </div>
        <div className="aui-task-badge-group">
          <span className={`aui-task-progress-badge ${isAllDone ? 'is-done' : ''}`}>
            {completedCount}/{totalCount} 已完成
          </span>
          <span className="aui-task-percent-text">{progressPercent}%</span>
          {isSuperseded ? (
            <button
              type="button"
              className="aui-task-collapse-btn"
              onClick={() => setIsManualExpanded(false)}
              title="收起历史快照"
              aria-label="收起历史快照"
            >
              <ChevronUp size={12} />
            </button>
          ) : null}
        </div>
      </div>

      {/* 精致微型进度条 */}
      <div className="aui-task-progress-track" aria-hidden="true">
        <div
          className={`aui-task-progress-fill ${isAllDone ? 'is-complete' : ''}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* 任务项清单 */}
      <div className="aui-task-list" role="list">
        {items.map((item, index) => {
          const isDone = item.status === 'completed'
          const isCurrent = item.status === 'in_progress'

          return (
            <div
              key={item.id ?? `task-${index}`}
              className={`aui-task-row is-${item.status}`}
              role="listitem"
            >
              <div className={`aui-task-check-circle is-${item.status}`} aria-hidden="true">
                {isDone ? (
                  <Check size={11} strokeWidth={2.8} className="aui-task-check-icon" />
                ) : isCurrent ? (
                  <Loader2 size={11} className="aui-task-spin-icon" />
                ) : (
                  <Circle size={7} className="aui-task-dot-icon" />
                )}
              </div>

              <div className={`aui-task-text ${isDone ? 'is-done' : isCurrent ? 'is-active' : ''}`}>
                {item.content}
              </div>

              {isCurrent ? <span className="aui-task-tag-running">进行中</span> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
