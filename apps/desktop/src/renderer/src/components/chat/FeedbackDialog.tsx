import React, { useState } from 'react'
import { Check, MessageSquareWarning, X } from 'lucide-react'

export interface FeedbackData {
  messageId: string
  reasonTags: string[]
  comment: string
}

export interface FeedbackDialogProps {
  messageId: string
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: FeedbackData) => void
}

const PREDEFINED_REASONS = [
  '事实不准确',
  '代码报错/无法运行',
  '未遵从提示指令',
  '回答不完整或缺乏细节',
  '逻辑混乱/推导错误',
  '包含有害或违规内容'
]

export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({
  messageId,
  isOpen,
  onClose,
  onSubmit
}) => {
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)

  if (!isOpen) return null

  const toggleTag = (tag: string): void => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    onSubmit({
      messageId,
      reasonTags: selectedTags,
      comment: comment.trim()
    })
    setSubmitted(true)
    setTimeout(() => {
      setSubmitted(false)
      setSelectedTags([])
      setComment('')
      onClose()
    }, 1500)
  }

  return (
    <div
      className="aui-feedback-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-dialog-title"
      onClick={onClose}
    >
      <div className="aui-feedback-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aui-feedback-header">
          <div className="aui-feedback-header-title" id="feedback-dialog-title">
            <MessageSquareWarning size={14} />
            <span>提供问题反馈</span>
          </div>
          <button
            type="button"
            className="aui-feedback-close"
            onClick={onClose}
            aria-label="关闭"
            title="关闭"
          >
            <X size={13} />
          </button>
        </div>

        {submitted ? (
          <div className="aui-feedback-success" role="status">
            <div className="aui-feedback-success-icon">
              <Check size={18} />
            </div>
            <p className="aui-feedback-success-text">感谢您的宝贵反馈，我们将持续改进！</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="aui-feedback-form">
            <div className="aui-feedback-section">
              <label className="aui-feedback-label">请选择问题类型（可多选）</label>
              <div className="aui-feedback-tags">
                {PREDEFINED_REASONS.map((tag) => {
                  const isSelected = selectedTags.includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`aui-feedback-tag ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="aui-feedback-section">
              <label htmlFor="feedback-comment" className="aui-feedback-label">
                详细描述（选填）
              </label>
              <textarea
                id="feedback-comment"
                className="aui-feedback-textarea"
                rows={3}
                placeholder="请详细描述模型在此处的不足或您期望的输出..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            <div className="aui-feedback-footer">
              <button type="button" className="aui-feedback-btn is-cancel" onClick={onClose}>
                取消
              </button>
              <button
                type="submit"
                className="aui-feedback-btn is-submit"
                disabled={selectedTags.length === 0 && !comment.trim()}
              >
                提交反馈
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
