import React from 'react'
import {
  X,
  MessageSquare,
  Sparkles,
  User,
  Tag,
  Layers,
  Code2,
  Terminal,
  FileText,
  ShieldCheck,
  Cpu,
  Bot,
  Edit3,
  Trash2
} from 'lucide-react'
import type { ExpertItem } from './hub-types'

interface ExpertDetailModalProps {
  expert: ExpertItem | null
  onClose: () => void
  onStartChat: (expert: ExpertItem, initialPrompt?: string) => void
  onEdit?: (expert: ExpertItem) => void
  onDelete?: (expertId: string) => void
}

function getDetailIcon(expert: ExpertItem): React.ReactNode {
  switch (expert.iconName) {
    case 'Layers':
      return <Layers size={20} />
    case 'Code2':
      return <Code2 size={20} />
    case 'Terminal':
      return <Terminal size={20} />
    case 'FileText':
      return <FileText size={20} />
    case 'ShieldCheck':
      return <ShieldCheck size={20} />
    case 'Cpu':
      return <Cpu size={20} />
    case 'Sparkles':
      return <Sparkles size={20} />
    default:
      return expert.isCustom ? <Sparkles size={20} /> : <Bot size={20} />
  }
}

export const ExpertDetailModal: React.FC<ExpertDetailModalProps> = ({
  expert,
  onClose,
  onStartChat,
  onEdit,
  onDelete
}) => {
  if (!expert) return null

  return (
    <div className="hub-modal-overlay" onClick={onClose}>
      <div className="hub-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="hub-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              className="hub-row-avatar"
              style={{ width: '40px', height: '40px', borderRadius: '8px' }}
            >
              {getDetailIcon(expert)}
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#18181b' }}>
                {expert.title}
              </div>
              <div style={{ fontSize: '12px', color: '#71717a', marginTop: '2px' }}>
                {expert.isCustom ? '自定义专属角色' : '系统官方预置'}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="关闭专家详情"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#8e8e93',
              padding: '4px',
              borderRadius: '6px'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="hub-modal-body">
          <div>
            <div
              style={{
                fontSize: '12.5px',
                fontWeight: 600,
                color: '#18181b',
                marginBottom: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <User size={13} color="#71717a" />
              <span>专家简介</span>
            </div>
            <p style={{ fontSize: '13px', color: '#52525b', lineHeight: 1.6, margin: 0 }}>
              {expert.description}
            </p>
          </div>

          {expert.systemPrompt && (
            <div>
              <div
                style={{
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#18181b',
                  marginBottom: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Sparkles size={13} color="#71717a" />
                <span>系统人设指令 (System Prompt)</span>
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#374151',
                  backgroundColor: '#f8f8fa',
                  padding: '10px 12px',
                  borderRadius: '7px',
                  border: '1px solid #e4e4e7',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit'
                }}
              >
                {expert.systemPrompt}
              </div>
            </div>
          )}

          <div>
            <div
              style={{
                fontSize: '12.5px',
                fontWeight: 600,
                color: '#18181b',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Tag size={13} color="#71717a" />
              <span>专长与标签</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {expert.tags.map((tag) => (
                <span key={tag} className="hub-tag-chip">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {expert.suggestedPrompts && expert.suggestedPrompts.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#18181b',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Sparkles size={13} color="#71717a" />
                <span>推荐提问引导</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {expert.suggestedPrompts.map((prompt) => (
                  <div
                    key={prompt}
                    className="hub-prompt-sample"
                    onClick={() => {
                      onStartChat(expert, prompt)
                      onClose()
                    }}
                  >
                    {`“${prompt}”`}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="hub-modal-footer"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            {onDelete && (
              <button
                type="button"
                className="hub-btn-secondary"
                style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                onClick={() => {
                  onDelete(expert.id)
                  onClose()
                }}
              >
                <Trash2 size={13} style={{ marginRight: '4px' }} />
                <span>删除角色</span>
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                className="hub-btn-secondary"
                onClick={() => {
                  onEdit(expert)
                  onClose()
                }}
              >
                <Edit3 size={13} style={{ marginRight: '4px' }} />
                <span>编辑角色</span>
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="hub-btn-secondary" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="hub-btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => {
                onStartChat(expert)
                onClose()
              }}
            >
              <MessageSquare size={13} />
              <span>立即对话</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
