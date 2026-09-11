import React, { useState, useEffect } from 'react'
import { X, Wrench, Shield, Check, Settings } from 'lucide-react'
import type { SkillItem } from './hub-types'

interface SkillConfigModalProps {
  skill: SkillItem | null
  isOpen: boolean
  onClose: () => void
  onSave?: (skill: SkillItem) => void
}

interface SkillConfigInnerFormProps {
  skill: SkillItem
  onClose: () => void
  onSave?: (skill: SkillItem) => void
}

function loadInitialConfig(skillId: string): { apiKey: string; customPrompt: string } {
  try {
    const saved = localStorage.getItem(`skill_config_${skillId}`)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        apiKey: parsed.apiKey || '',
        customPrompt: parsed.customPrompt || ''
      }
    }
  } catch {
    // ignore
  }
  return { apiKey: '', customPrompt: '' }
}

const SkillConfigInnerForm: React.FC<SkillConfigInnerFormProps> = ({ skill, onClose, onSave }) => {
  const [initialConfig] = useState(() => loadInitialConfig(skill.id))
  const [enabled, setEnabled] = useState(() => skill.isEnabled !== false)
  const [apiKey, setApiKey] = useState(() => initialConfig.apiKey)
  const [customPrompt, setCustomPrompt] = useState(() => initialConfig.customPrompt)
  const [savedSuccess, setSavedSuccess] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSave = (): void => {
    try {
      localStorage.setItem(
        `skill_config_${skill.id}`,
        JSON.stringify({ apiKey, customPrompt, enabled })
      )
    } catch {
      // ignore
    }
    setSavedSuccess(true)
    setTimeout(() => {
      setSavedSuccess(false)
      onSave?.({ ...skill, isEnabled: enabled })
      onClose()
    }, 400)
  }

  return (
    <div className="hub-modal-overlay" onClick={onClose}>
      <div
        className="hub-modal-container"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        {/* Header */}
        <div className="hub-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={18} color="#71717a" />
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary, #18181b)' }}>
              技能配置
            </span>
          </div>
          <button
            type="button"
            className="hub-modal-close"
            onClick={onClose}
            aria-label="关闭配置"
            title="关闭 (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div
          className="hub-modal-body"
          style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {/* Skill Identity Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderRadius: 10,
              background: '#f4f4f5',
              border: '1px solid #e4e4e7'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #27272a, #18181b)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  overflow: 'hidden'
                }}
              >
                {skill.logo ? (
                  <img
                    src={skill.logo}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <Wrench size={16} />
                )}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>{skill.name}</div>
                <div style={{ fontSize: 11.5, color: '#71717a' }}>{skill.identifier}</div>
              </div>
            </div>

            <button
              type="button"
              className={`connector-connect-btn${enabled ? ' is-active' : ''}`}
              style={{ width: 'auto', padding: '3px 10px', height: 26, fontSize: 12 }}
              onClick={() => setEnabled((prev) => !prev)}
            >
              {enabled ? '已启用' : '已禁用'}
            </button>
          </div>

          {/* Description */}
          <div style={{ fontSize: 12.5, color: '#52525b', lineHeight: 1.5 }}>
            {skill.description}
          </div>

          {/* Tools Info */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: '#71717a'
            }}
          >
            {skill.isLocal ? (
              <>
                <Shield size={13} color="#059669" />
                <span title={skill.sourcePath}>
                  本地技能 · 来源：{skill.sourcePath ?? '工作区'}
                </span>
              </>
            ) : (
              <>
                <Shield size={13} color="#059669" />
                <span>包含 {skill.toolsCount || skill.tools?.length || 1} 个内置工具能力</span>
              </>
            )}
          </div>

          {/* Form fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="hub-field-group">
              <label className="hub-field-label">API 访问凭证 / Token（可选）</label>
              <input
                type="password"
                className="hub-field-input"
                placeholder="若该技能涉及外部服务，可填入专用密钥"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            <div className="hub-field-group">
              <label className="hub-field-label">附加指令 / 自定义提示词（可选）</label>
              <textarea
                className="hub-field-textarea"
                rows={3}
                placeholder="为该技能添加专属的行为偏好或执行约束..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="hub-modal-footer">
          <button type="button" className="hub-modal-btn-cancel" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="hub-modal-btn-save"
            onClick={handleSave}
            disabled={savedSuccess}
          >
            {savedSuccess ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Check size={14} /> 已保存
              </span>
            ) : (
              '保存配置'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export const SkillConfigModal: React.FC<SkillConfigModalProps> = ({
  skill,
  isOpen,
  onClose,
  onSave
}) => {
  if (!isOpen || !skill) return null

  return <SkillConfigInnerForm key={skill.id} skill={skill} onClose={onClose} onSave={onSave} />
}
