import React from 'react'
import {
  Edit3,
  Trash2,
  Sparkles,
  Layers,
  Code2,
  Terminal,
  FileText,
  ShieldCheck,
  Bot,
  Plus
} from 'lucide-react'
import type { ExpertItem } from './hub-types'

interface ExpertCardGridProps {
  customExperts: ExpertItem[]
  systemExperts: ExpertItem[]
  searchQuery: string
  onSelectExpert: (expert: ExpertItem) => void
  onStartChat: (expert: ExpertItem) => void
  onEditExpert: (expert: ExpertItem) => void
  onDeleteExpert: (expertId: string) => void
  onCloneExpert?: (expert: ExpertItem) => void
}

function getExpertAvatar(expert: ExpertItem): { icon: React.ReactNode; bg: string } {
  switch (expert.iconName) {
    case 'Layers':
      return {
        icon: <Layers size={18} color="#ffffff" />,
        bg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
      }
    case 'Code2':
      return {
        icon: <Code2 size={18} color="#ffffff" />,
        bg: 'linear-gradient(135deg, #8b5cf6, #6d28d9)'
      }
    case 'Terminal':
      return {
        icon: <Terminal size={18} color="#ffffff" />,
        bg: 'linear-gradient(135deg, #10b981, #047857)'
      }
    case 'FileText':
      return {
        icon: <FileText size={18} color="#ffffff" />,
        bg: 'linear-gradient(135deg, #f59e0b, #d97706)'
      }
    case 'ShieldCheck':
      return {
        icon: <ShieldCheck size={18} color="#ffffff" />,
        bg: 'linear-gradient(135deg, #ef4444, #b91c1c)'
      }
    case 'Sparkles':
      return {
        icon: <Sparkles size={18} color="#ffffff" />,
        bg: 'linear-gradient(135deg, #06b6d4, #0e7490)'
      }
    default:
      return {
        icon: expert.isCustom ? (
          <Sparkles size={18} color="#ffffff" />
        ) : (
          <Bot size={18} color="#ffffff" />
        ),
        bg: expert.isCustom
          ? 'linear-gradient(135deg, #6366f1, #4338ca)'
          : 'linear-gradient(135deg, #64748b, #334155)'
      }
  }
}

export const ExpertCardGrid: React.FC<ExpertCardGridProps> = ({
  customExperts,
  systemExperts,
  searchQuery,
  onSelectExpert,
  onStartChat,
  onEditExpert,
  onDeleteExpert
}) => {
  const query = searchQuery.trim().toLowerCase()

  const filterFn = (e: ExpertItem): boolean => {
    if (!query) return true
    return (
      e.name.toLowerCase().includes(query) ||
      e.title.toLowerCase().includes(query) ||
      e.description.toLowerCase().includes(query) ||
      e.tags.some((t) => t.toLowerCase().includes(query))
    )
  }

  const filteredCustom = customExperts.filter(filterFn)
  const filteredSystem = systemExperts.filter(filterFn)

  const renderCard = (expert: ExpertItem): React.ReactNode => {
    const avatar = getExpertAvatar(expert)
    const displayName = expert.name || expert.title
    const displaySubtitle =
      expert.name && expert.title && expert.name !== expert.title
        ? expert.title
        : expert.isCustom
          ? '自定义专家'
          : '系统预置'

    return (
      <div
        key={expert.id}
        className="hub-card connector-card"
        onClick={() => onSelectExpert(expert)}
      >
        <div className="connector-card-icon" style={{ background: avatar.bg }}>
          {avatar.icon}
        </div>

        <div className="connector-card-main">
          <div className="connector-card-name-row">
            <div className="connector-card-name">{displayName}</div>
            <span className="connector-card-badge">{displaySubtitle}</span>
          </div>
          <div className="connector-card-desc">{expert.description}</div>
        </div>

        <div className="connector-card-action" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              className="connector-connect-btn"
              title="编辑角色"
              onClick={() => onEditExpert(expert)}
            >
              <Edit3 size={13} />
            </button>
            <button
              type="button"
              className="connector-connect-btn"
              title="删除角色"
              onClick={() => onDeleteExpert(expert.id)}
            >
              <Trash2 size={13} />
            </button>
            <button
              type="button"
              className="connector-connect-btn is-active"
              title="立即召唤开启对话"
              onClick={() => onStartChat(expert)}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const allFiltered = [...filteredCustom, ...filteredSystem]

  return (
    <div className="hub-list-container">
      {allFiltered.length > 0 ? (
        <div className="hub-cards-grid">{allFiltered.map(renderCard)}</div>
      ) : (
        <div className="hub-inset-list">
          <div className="hub-empty-list">{query ? '未搜索到匹配的专家' : '暂无专家'}</div>
        </div>
      )}
    </div>
  )
}
