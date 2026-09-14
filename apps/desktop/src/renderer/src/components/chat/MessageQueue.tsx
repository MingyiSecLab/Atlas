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
      className="aui-message-queue-container message-queue-container"
      role="status"
      aria-label="待发送任务队列"
    >
      {/* 顶部运行指示器 */}
      {isRunning && (
        <div className="aui-queue-status-bar">
          <div className="aui-queue-status-left">
            <span className="aui-queue-pulse-dot" aria-hidden="true" />
            <span className="aui-queue-running-text" title={runningText}>
              {runningText}
            </span>
          </div>
        </div>
      )}

      {/* 队列卡片 */}
      <div className="aui-queue-card">
        {/* 头部摘要栏 */}
        <div className="aui-queue-header">
          <div className="aui-queue-header-left">
            <Layers size={13} className="aui-queue-header-icon" />
            <span className="aui-queue-header-title">任务队列</span>
            <span className="aui-queue-header-count message-queue-header-count">
              ({queued.length} 条待处理)
            </span>
          </div>

          <div className="aui-queue-header-actions">
            {queued.length > 1 && (
              <button
                type="button"
                className="aui-queue-action-btn message-queue-action-btn"
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
              className="aui-queue-action-btn is-clear message-queue-action-btn is-danger"
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
          <ul className="aui-queue-list message-queue-list">
            {queued.map((item, index) => {
              const isFirst = index === 0

              return (
                <li key={item.id} className="aui-queue-item message-queue-item">
                  <div className="aui-queue-item-main">
                    <span className="aui-queue-item-index">#{index + 1}</span>

                    {/* 特殊标记 (技能、专家、模式等) */}
                    {item.skill && (
                      <span className="aui-queue-tag is-skill" title={`技能: ${item.skill.name}`}>
                        <Sparkles size={10} />
                        <span>/{item.skill.name}</span>
                      </span>
                    )}

                    {item.expert && (
                      <span className="aui-queue-tag is-expert" title={`专家: ${item.expert.name}`}>
                        <span>@{item.expert.name}</span>
                      </span>
                    )}

                    {item.attachments && item.attachments.length > 0 && (
                      <span className="aui-queue-tag is-attachment" title="包含图片附件">
                        <ImageIcon size={10} />
                        <span>{item.attachments.length}</span>
                      </span>
                    )}

                    <span className="aui-queue-item-text" title={item.text}>
                      {item.text || '(仅附件)'}
                    </span>
                  </div>

                  <div className="aui-queue-item-actions">
                    {/* 插队置顶 (Steer) */}
                    {!isFirst && (
                      <button
                        type="button"
                        className="aui-queue-btn is-steer message-queue-item-btn is-steer"
                        onClick={() => onSteerItem(item.id)}
                        aria-label={`将第 ${index + 1} 条任务优先插队至首位`}
                        title="优先插队 (Steer)"
                      >
                        <ArrowUp size={12} />
                        <span>插队</span>
                      </button>
                    )}

                    {/* 编辑 */}
                    {onEditItem && (
                      <button
                        type="button"
                        className="aui-queue-btn is-edit message-queue-item-btn"
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

                    {/* 取消 / 移除 */}
                    <button
                      type="button"
                      className="aui-queue-btn is-remove message-queue-item-btn is-remove"
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
                    onChange={(e) => setEditText(e.target.value)}
                    rows={4}
                    autoFocus
                  />
                </div>
                <div className="message-queue-edit-footer">
                  <button
                    type="button"
                    className="message-queue-edit-btn is-cancel"
                    onClick={() => setEditingItem(null)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="message-queue-edit-btn is-save"
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
