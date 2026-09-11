import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
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
    <div className="message-queue-container" role="status" aria-label="待发送任务队列">
      {/* 顶部运行中状态胶囊 */}
      <div className="message-queue-running-card">
        <span className="message-queue-pulse-wrapper">
          <span className="message-queue-pulse-ring" />
          <span className="message-queue-pulse-dot" />
        </span>
        <span className="message-queue-running-text" title={runningText}>
          {runningText}
        </span>
        <span className="message-queue-running-badge">{isRunning ? '生成中' : '排队中'}</span>
      </div>

      {/* 队列标题及全局控制栏 */}
      <div className="message-queue-header">
        <div className="message-queue-header-left">
          <span className="message-queue-header-title">排队队列</span>
          <span className="message-queue-header-count">({queued.length} 条待处理)</span>
        </div>
        <div className="message-queue-header-actions">
          {queued.length > 1 && (
            <button
              type="button"
              className="message-queue-action-btn"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-label={isExpanded ? '收起排队列表' : '展开排队列表'}
              title={isExpanded ? '收起' : '展开'}
            >
              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              <span>{isExpanded ? '收起' : '展开'}</span>
            </button>
          )}
          <button
            type="button"
            className="message-queue-action-btn is-danger"
            onClick={onClearAll}
            aria-label="清空所有排队任务"
            title="清空全部排队"
          >
            <Trash2 size={13} />
            <span>清空</span>
          </button>
        </div>
      </div>

      {/* 排队项目列表 */}
      {isExpanded && (
        <ul className="message-queue-list">
          {queued.map((item, index) => {
            const hasAttachments = Boolean(item.attachments && item.attachments.length > 0)
            const isFirst = index === 0
            return (
              <li key={item.id} className="message-queue-item">
                <span className="message-queue-item-index">{index + 1}</span>

                {/* 技能或专家附加徽章 */}
                {item.skill && (
                  <span
                    className="message-queue-item-tag is-skill"
                    title={`指定技能: /${item.skill.name}`}
                  >
                    <Sparkles size={11} />
                    <span>/{item.skill.name}</span>
                  </span>
                )}
                {item.expert && (
                  <span
                    className="message-queue-item-tag is-expert"
                    title={`指定专家: ${item.expert.name}`}
                  >
                    <span>@{item.expert.name}</span>
                  </span>
                )}
                {hasAttachments && (
                  <span
                    className="message-queue-item-tag is-attachment"
                    title={`包含 ${item.attachments?.length} 个附件`}
                  >
                    <ImageIcon size={11} />
                    <span>{item.attachments?.length}</span>
                  </span>
                )}

                {/* 消息正文摘要 */}
                <span className="message-queue-item-text" title={item.text || '(空文本)'}>
                  {item.text || (hasAttachments ? '[附件图片]' : '(无文本)')}
                </span>

                {/* 动作区：插队优先 + 编辑 Prompt + 单项移除 */}
                <div className="message-queue-item-actions">
                  {!isFirst && (
                    <button
                      type="button"
                      className="message-queue-item-btn is-steer"
                      onClick={() => onSteerItem(item.id)}
                      aria-label={`将第 ${index + 1} 条任务优先插队至首位`}
                      title="优先插队 (Steer)"
                    >
                      <ArrowUp size={13} />
                    </button>
                  )}
                  {onEditItem && (
                    <button
                      type="button"
                      className="message-queue-item-btn is-edit"
                      onClick={() => {
                        setEditingItem({ id: item.id, text: item.text })
                        setEditText(item.text)
                      }}
                      aria-label={`编辑排队任务“${item.text.slice(0, 16)}”`}
                      title="编辑 Prompt"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="message-queue-item-btn is-cancel"
                    onClick={() => onCancelItem(item.id)}
                    aria-label={`移除排队任务“${item.text.slice(0, 16)}”`}
                    title="移除"
                  >
                    <X size={13} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* 排队 Prompt 编辑浮层弹窗（通过 Portal 挂载到 body，避免被 composer 层叠上下文拦截） */}
      {editingItem && typeof document !== 'undefined'
        ? createPortal(
            <div className="message-queue-edit-overlay" onClick={() => setEditingItem(null)}>
              <div
                className="message-queue-edit-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="message-queue-edit-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="message-queue-edit-header">
                  <span id="message-queue-edit-title" className="message-queue-edit-title">
                    编辑排队任务 Prompt
                  </span>
                  <button
                    type="button"
                    className="message-queue-edit-close"
                    onClick={() => setEditingItem(null)}
                    aria-label="关闭编辑"
                    title="关闭"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="message-queue-edit-body">
                  <textarea
                    className="message-queue-edit-textarea"
                    value={editText}
                    autoFocus
                    placeholder="修改提示词内容..."
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault()
                        if (editText.trim() && editText !== editingItem.text) {
                          onEditItem?.(editingItem.id, editText.trim())
                          setEditingItem(null)
                        }
                      } else if (e.key === 'Escape') {
                        setEditingItem(null)
                      }
                    }}
                  />
                </div>
                <div className="message-queue-edit-footer">
                  <span className="message-queue-edit-hint">按 ⌘+Enter 快速保存，Esc 取消</span>
                  <div className="message-queue-edit-buttons">
                    <button
                      type="button"
                      className="message-queue-edit-btn is-secondary"
                      onClick={() => setEditingItem(null)}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="message-queue-edit-btn is-primary"
                      disabled={!editText.trim() || editText === editingItem.text}
                      onClick={() => {
                        onEditItem?.(editingItem.id, editText.trim())
                        setEditingItem(null)
                      }}
                    >
                      保存修改
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
