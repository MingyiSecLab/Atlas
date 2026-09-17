import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Layers,
  Pencil,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import type { ChatImageAttachment } from './types'
import type { ExpertItem } from '../hub/hub-types'
import type { RuntimeSkillInfo } from '@mingyi/runtime'

export interface QueuedItem {
  id: string
  text: string
  attachments?: ChatImageAttachment[]
  goalMode?: boolean
  expert?: ExpertItem
  skill?: RuntimeSkillInfo
}

export interface MessageQueueProps {
  isRunning: boolean
  runningText?: string
  queued: QueuedItem[]
  onCancelItem: (id: string) => void
  onSteerItem: (id: string) => void
  onEditItem?: (id: string, text: string) => void
  onClearAll: () => void
}

export const MessageQueue: React.FC<MessageQueueProps> = ({
  isRunning,
  runningText = 'AI 正在处理当前任务，完成后将自动发送',
  queued,
  onCancelItem,
  onSteerItem,
  onEditItem,
  onClearAll
}) => {
  const [isExpanded, setIsExpanded] = useState(true)
  const [editingItem, setEditingItem] = useState<{ id: string; text: string } | null>(null)
  const [editText, setEditText] = useState('')

  if (queued.length === 0) return null

  return (
    <div
      className="message-queue-container relative mx-auto w-full max-w-3xl px-4 py-1 select-none"
      role="status"
      aria-label="待发送任务队列"
    >
      {/* 顶部运行指示器 */}
      {isRunning && (
        <div className="mb-1.5 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-primary">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
            <span className="text-[11px] font-medium leading-none" title={runningText}>
              {runningText}
            </span>
          </div>
        </div>
      )}

      {/* 队列卡片 */}
      <div className="rounded-xl border border-border/80 bg-card/95 shadow-sm backdrop-blur-md overflow-hidden text-xs">
        {/* 头部摘要栏 */}
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3.5 py-1.5">
          <div className="flex items-center gap-2">
            <Layers size={13} className="text-muted-foreground" />
            <span className="font-semibold text-foreground">任务队列</span>
            <span className="message-queue-header-count text-[11px] text-muted-foreground">
              ({queued.length} 条待处理)
            </span>
          </div>

          <div className="flex items-center gap-1">
            {queued.length > 1 && (
              <button
                type="button"
                className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                onClick={() => setIsExpanded((prev) => !prev)}
                aria-label={isExpanded ? '收起排队列表' : '展开排队列表'}
                title={isExpanded ? '收起' : '展开'}
              >
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                <span>{isExpanded ? '收起' : '展开'}</span>
              </button>
            )}

            <button
              type="button"
              className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-destructive/80 hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
              onClick={onClearAll}
              aria-label="清空所有排队任务"
              title="清空队列中所有任务"
            >
              <Trash2 size={12} />
              <span>清空</span>
            </button>
          </div>
        </div>

        {/* 展开的排队项列表 */}
        {isExpanded && (
          <ul className="message-queue-list divide-y divide-border/40 max-h-48 overflow-y-auto">
            {queued.map((item, index) => {
              const isFirst = index === 0

              return (
                <li
                  key={item.id}
                  className="message-queue-item flex items-center justify-between gap-3 px-3.5 py-2 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-mono text-[10px] text-muted-foreground/70">
                      #{index + 1}
                    </span>

                    {/* 特殊标记 */}
                    {item.skill && (
                      <span
                        className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400"
                        title={`技能: ${item.skill.name}`}
                      >
                        <Sparkles size={9} />
                        <span>/{item.skill.name}</span>
                      </span>
                    )}

                    {item.expert && (
                      <span
                        className="inline-flex items-center rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400"
                        title={`专家: ${item.expert.name}`}
                      >
                        <span>@{item.expert.name}</span>
                      </span>
                    )}

                    {item.attachments && item.attachments.length > 0 && (
                      <span
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        title="包含图片附件"
                      >
                        <ImageIcon size={10} />
                        <span>{item.attachments.length}</span>
                      </span>
                    )}

                    <span className="truncate text-xs text-foreground" title={item.text}>
                      {item.text || '(仅附件)'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* 插队置顶 (Steer) */}
                    {!isFirst && (
                      <button
                        type="button"
                        className="inline-flex h-6 items-center gap-1 rounded-md bg-primary/10 px-2 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                        onClick={() => onSteerItem(item.id)}
                        aria-label={`将第 ${index + 1} 条任务优先插队至首位`}
                        title="优先插队 (Steer)"
                      >
                        <ArrowUp size={11} />
                        <span>插队</span>
                      </button>
                    )}

                    {/* 编辑 */}
                    {onEditItem && (
                      <button
                        type="button"
                        className="size-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                        onClick={() => {
                          setEditingItem({ id: item.id, text: item.text })
                          setEditText(item.text)
                        }}
                        aria-label={`编辑排队任务“${item.text.slice(0, 16)}”`}
                        title="编辑 Prompt"
                      >
                        <Pencil size={11} />
                      </button>
                    )}

                    {/* 取消 / 移除 */}
                    <button
                      type="button"
                      className="size-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
                      onClick={() => onCancelItem(item.id)}
                      aria-label={`移除排队任务“${item.text.slice(0, 16)}”`}
                      title="移出队列"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* 排队 Prompt 编辑浮层弹窗（Portal 到 body 避免层叠上下文遮挡） */}
      {editingItem && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 animate-in fade-in duration-150"
              onClick={() => setEditingItem(null)}
            >
              <div
                className="message-queue-edit-modal w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl animate-in zoom-in-95 duration-150 select-text"
                role="dialog"
                aria-modal="true"
                aria-labelledby="message-queue-edit-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-3 border-b border-border/60">
                  <span
                    id="message-queue-edit-title"
                    className="text-xs font-semibold text-foreground"
                  >
                    编辑排队任务 Prompt
                  </span>
                  <button
                    type="button"
                    className="size-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => setEditingItem(null)}
                    aria-label="关闭编辑"
                    title="关闭"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="py-3">
                  <textarea
                    className="w-full resize-none rounded-xl border border-border/80 bg-muted/30 p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={4}
                    autoFocus
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                  <button
                    type="button"
                    className="h-7 rounded-lg border border-border/60 px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                    onClick={() => setEditingItem(null)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="h-7 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm hover:opacity-90 active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
                    onClick={() => {
                      if (editText.trim() && onEditItem) {
                        onEditItem(editingItem.id, editText.trim())
                      }
                      setEditingItem(null)
                    }}
                    disabled={!editText.trim()}
                  >
                    保存修改
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
