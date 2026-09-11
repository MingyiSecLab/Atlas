import React, { useState } from 'react'
import {
  X,
  Sparkles,
  Check,
  Code2,
  Terminal,
  Layers,
  FileText,
  ShieldCheck,
  Cpu,
  Bot
} from 'lucide-react'
import type { ExpertItem } from './hub-types'

const PRESET_ICONS = [
  { name: 'Sparkles', label: '通用', icon: Sparkles },
  { name: 'Code2', label: '代码', icon: Code2 },
  { name: 'Terminal', label: '终端', icon: Terminal },
  { name: 'Layers', label: '架构', icon: Layers },
  { name: 'FileText', label: '文档', icon: FileText },
  { name: 'ShieldCheck', label: '安全', icon: ShieldCheck },
  { name: 'Cpu', label: '算法', icon: Cpu },
  { name: 'Bot', label: '助理', icon: Bot }
]

interface ExpertEditModalProps {
  isOpen: boolean
  expertToEdit: ExpertItem | null
  onClose: () => void
  onSave: (expert: ExpertItem) => void
}

interface InnerFormProps {
  expertToEdit: ExpertItem | null
  onClose: () => void
  onSave: (expert: ExpertItem) => void
}

const ExpertEditInnerForm: React.FC<InnerFormProps> = ({ expertToEdit, onClose, onSave }) => {
  const [title, setTitle] = useState(() => expertToEdit?.title || '')
  const [description, setDescription] = useState(() => expertToEdit?.description || '')
  const [systemPrompt, setSystemPrompt] = useState(() => expertToEdit?.systemPrompt || '')
  const [tagDraft, setTagDraft] = useState('')
  const [tags, setTags] = useState<string[]>(() => expertToEdit?.tags || [])
  const [iconName, setIconName] = useState(() => expertToEdit?.iconName || 'Sparkles')
  const [suggestedPromptsDraft, setSuggestedPromptsDraft] = useState(
    () => expertToEdit?.suggestedPrompts?.join('\n') || ''
  )

  const handleAddTag = (): void => {
    const trimmed = tagDraft.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed])
      setTagDraft('')
    }
  }

  const handleRemoveTag = (tagToRemove: string): void => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove))
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!title.trim()) return

    const prompts = suggestedPromptsDraft
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)

    const updatedExpert: ExpertItem = {
      id: expertToEdit ? expertToEdit.id : `custom_${Date.now()}`,
      name: title.trim(),
      title: title.trim(),
      description: description.trim() || '自定义专属专家',
      systemPrompt: systemPrompt.trim(),
      tags: tags.length > 0 ? tags : ['自定义专家'],
      iconName,
      isCustom: true,
      suggestedPrompts: prompts.length > 0 ? prompts : undefined,
      updatedAt: new Date().toISOString(),
      createdAt: expertToEdit?.createdAt || new Date().toISOString()
    }

    onSave(updatedExpert)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="hub-modal-body">
      {/* Icon Selector */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '12px',
            color: '#71717a',
            marginBottom: '6px'
          }}
        >
          角色图标
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {PRESET_ICONS.map((item) => {
            const Icon = item.icon
            const isSelected = iconName === item.name
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => setIconName(item.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  backgroundColor: isSelected ? '#18181b' : '#f4f4f5',
                  color: isSelected ? '#ffffff' : '#52525b',
                  border: isSelected ? '1px solid #18181b' : '1px solid #e4e4e7',
                  cursor: 'pointer',
                  fontSize: '12px',
                  transition: 'all 0.12s ease'
                }}
              >
                <Icon size={13} />
                <span>{item.label}</span>
                {isSelected && <Check size={11} />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Title */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '12.5px',
            fontWeight: 600,
            color: '#18181b',
            marginBottom: '6px'
          }}
        >
          专家名称 / 职位 <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input
          type="text"
          required
          placeholder="例如：重构专家、前端架构师、API 设计师..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            width: '100%',
            height: '32px',
            padding: '0 10px',
            borderRadius: '6px',
            border: '1px solid #e4e4e7',
            fontSize: '12.5px',
            outline: 'none',
            backgroundColor: '#ffffff'
          }}
        />
      </div>

      {/* Description */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '12.5px',
            fontWeight: 600,
            color: '#18181b',
            marginBottom: '6px'
          }}
        >
          简要简介
        </label>
        <input
          type="text"
          placeholder="一句话介绍该专家的擅长领域与职责"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{
            width: '100%',
            height: '32px',
            padding: '0 10px',
            borderRadius: '6px',
            border: '1px solid #e4e4e7',
            fontSize: '12.5px',
            outline: 'none',
            backgroundColor: '#ffffff'
          }}
        />
      </div>

      {/* System Prompt */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '12.5px',
            fontWeight: 600,
            color: '#18181b',
            marginBottom: '6px'
          }}
        >
          系统设定 / Prompt 提示词
        </label>
        <textarea
          rows={4}
          placeholder="定义专家的角色人设、行为准则、输出规范等..."
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid #e4e4e7',
            fontSize: '12.5px',
            lineHeight: 1.5,
            outline: 'none',
            resize: 'vertical',
            backgroundColor: '#ffffff'
          }}
        />
      </div>

      {/* Suggested Prompts */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '12.5px',
            fontWeight: 600,
            color: '#18181b',
            marginBottom: '6px'
          }}
        >
          快捷提问引导 (每行一条)
        </label>
        <textarea
          rows={2}
          placeholder="例如：帮我审查这段代码&#10;优化这个 SQL 查询"
          value={suggestedPromptsDraft}
          onChange={(e) => setSuggestedPromptsDraft(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid #e4e4e7',
            fontSize: '12px',
            lineHeight: 1.4,
            outline: 'none',
            resize: 'none',
            backgroundColor: '#ffffff'
          }}
        />
      </div>

      {/* Tags */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '12.5px',
            fontWeight: 600,
            color: '#18181b',
            marginBottom: '6px'
          }}
        >
          专长标签
        </label>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
          <input
            type="text"
            placeholder="输入标签按回车添加"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddTag()
              }
            }}
            style={{
              flex: 1,
              height: '30px',
              padding: '0 8px',
              borderRadius: '6px',
              border: '1px solid #e4e4e7',
              fontSize: '12px',
              outline: 'none'
            }}
          />
          <button
            type="button"
            onClick={handleAddTag}
            style={{
              padding: '0 12px',
              borderRadius: '6px',
              border: '1px solid #e4e4e7',
              backgroundColor: '#f4f4f5',
              fontSize: '12px',
              color: '#374151',
              cursor: 'pointer'
            }}
          >
            添加
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {tags.map((t) => (
            <span
              key={t}
              className="hub-tag-chip"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              {t}
              <X size={11} style={{ cursor: 'pointer' }} onClick={() => handleRemoveTag(t)} />
            </span>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="hub-modal-footer" style={{ margin: '0 -20px -20px -20px' }}>
        <button type="button" className="hub-btn-secondary" onClick={onClose}>
          取消
        </button>
        <button type="submit" className="hub-btn-primary">
          {expertToEdit ? '保存修改' : '创建专家'}
        </button>
      </div>
    </form>
  )
}

export const ExpertEditModal: React.FC<ExpertEditModalProps> = ({
  isOpen,
  expertToEdit,
  onClose,
  onSave
}) => {
  if (!isOpen) return null

  return (
    <div className="hub-modal-overlay" onClick={onClose}>
      <div
        className="hub-modal-container"
        style={{ width: '520px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hub-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} color="#18181b" />
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#18181b' }}>
              {expertToEdit ? '编辑专家' : '新建自定义专家'}
            </span>
          </div>

          <button
            onClick={onClose}
            aria-label="关闭窗口"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#8e8e93',
              padding: '4px'
            }}
          >
            <X size={16} />
          </button>
        </div>

        <ExpertEditInnerForm
          key={expertToEdit ? expertToEdit.id : 'new'}
          expertToEdit={expertToEdit}
          onClose={onClose}
          onSave={onSave}
        />
      </div>
    </div>
  )
}
