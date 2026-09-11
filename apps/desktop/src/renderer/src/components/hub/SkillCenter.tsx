import React, { useState, useEffect, useRef } from 'react'
import {
  Wrench,
  GitBranch,
  Globe,
  FileSearch,
  Clock,
  ShieldCheck,
  Plus,
  Play,
  Settings,
  MoreHorizontal,
  Power,
  Trash2
} from 'lucide-react'
import type { SkillItem } from './hub-types'
import { SkillConfigModal } from './SkillConfigModal'

interface SkillCenterProps {
  skills: SkillItem[]
  searchQuery: string
  onToggleSkill?: (skillId: string) => void
  onTrySkill?: (skill: SkillItem) => void
}

function getSkillAvatar(skill: SkillItem): { icon: React.ReactNode; bg: string } {
  switch (skill.iconName) {
    case 'GitBranch':
      return {
        icon: <GitBranch size={18} color="#ffffff" />,
        bg: 'linear-gradient(135deg, #f97316, #ea580c)'
      }
    case 'Globe':
      return {
        icon: <Globe size={18} color="#ffffff" />,
        bg: 'linear-gradient(135deg, #0ea5e9, #0284c7)'
      }
    case 'FileSearch':
      return {
        icon: <FileSearch size={18} color="#ffffff" />,
        bg: 'linear-gradient(135deg, #8b5cf6, #7c3aed)'
      }
    case 'Clock':
      return {
        icon: <Clock size={18} color="#ffffff" />,
        bg: 'linear-gradient(135deg, #10b981, #059669)'
      }
    case 'ShieldCheck':
      return {
        icon: <ShieldCheck size={18} color="#ffffff" />,
        bg: 'linear-gradient(135deg, #0f766e, #115e59)'
      }
    default:
      return {
        icon: <Wrench size={18} color="#ffffff" />,
        bg: 'linear-gradient(135deg, #6366f1, #4f46e5)'
      }
  }
}

export const SkillCenter: React.FC<SkillCenterProps> = ({
  skills,
  searchQuery,
  onToggleSkill,
  onTrySkill
}) => {
  const query = searchQuery.trim().toLowerCase()

  // Track installed skill IDs
  const [installedSkillIds, setInstalledSkillIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('installed_skill_ids')
      if (saved) return new Set(JSON.parse(saved))
    } catch {
      // ignore
    }
    return new Set<string>()
  })

  // Track disabled skill IDs
  const [disabledSkillIds, setDisabledSkillIds] = useState<Set<string>>(() => new Set())

  // Dropdown menu state
  const [openMenuSkillId, setOpenMenuSkillId] = useState<string | null>(null)

  // Configuration modal state
  const [configuringSkill, setConfiguringSkill] = useState<SkillItem | null>(null)

  const menuContainerRef = useRef<HTMLDivElement>(null)

  // Click outside to close dropdown menu
  useEffect(() => {
    const handleWindowClick = (): void => {
      setOpenMenuSkillId(null)
    }
    window.addEventListener('click', handleWindowClick)
    return () => window.removeEventListener('click', handleWindowClick)
  }, [])

  const saveInstalled = (set: Set<string>): void => {
    try {
      localStorage.setItem('installed_skill_ids', JSON.stringify([...set]))
    } catch {
      // ignore
    }
  }

  const handleInstall = (skillId: string): void => {
    setInstalledSkillIds((prev) => {
      const next = new Set(prev)
      next.add(skillId)
      saveInstalled(next)
      return next
    })
    onToggleSkill?.(skillId)
  }

  const handleUninstall = (skillId: string): void => {
    setInstalledSkillIds((prev) => {
      const next = new Set(prev)
      next.delete(skillId)
      saveInstalled(next)
      return next
    })
  }

  const handleToggleDisable = (skillId: string): void => {
    setDisabledSkillIds((prev) => {
      const next = new Set(prev)
      if (next.has(skillId)) next.delete(skillId)
      else next.add(skillId)
      return next
    })
  }

  const filteredSkills = skills.filter((skill) => {
    if (!query) return true
    return (
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query) ||
      skill.identifier.toLowerCase().includes(query) ||
      skill.tags.some((t) => t.toLowerCase().includes(query))
    )
  })

  return (
    <div className="hub-list-container" ref={menuContainerRef}>
      {filteredSkills.length > 0 ? (
        <div className="hub-cards-grid">
          {filteredSkills.map((skill) => {
            const avatar = getSkillAvatar(skill)
            const isInstalled = skill.isLocal === true || installedSkillIds.has(skill.id)
            const isDisabled = disabledSkillIds.has(skill.id)

            return (
              <div
                key={skill.id}
                className={`hub-card connector-card${isDisabled ? ' is-disabled' : ''}`}
                onClick={() => {
                  if (isInstalled) {
                    setConfiguringSkill(skill)
                  } else {
                    handleInstall(skill.id)
                  }
                }}
              >
                <div className="connector-card-icon" style={{ background: avatar.bg }}>
                  {skill.logo ? (
                    <img
                      src={skill.logo}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    avatar.icon
                  )}
                </div>

                <div className="connector-card-main">
                  <div className="connector-card-name-row">
                    <div className="connector-card-name">{skill.name}</div>
                    <span
                      className={`connector-card-status-dot connector-card-status-dot--${isInstalled && !isDisabled ? 'connected' : 'disabled'}`}
                      title={isInstalled ? (isDisabled ? '已禁用' : '已就绪') : '未添加'}
                    />
                    <span className="connector-card-badge">
                      {skill.isLocal
                        ? '本地技能'
                        : `${skill.toolsCount || skill.tools?.length || 1} 个工具`}
                    </span>
                  </div>
                  <div className="connector-card-desc">{skill.description}</div>
                </div>

                <div className="connector-card-action" onClick={(e) => e.stopPropagation()}>
                  {!isInstalled ? (
                    <button
                      type="button"
                      className="connector-connect-btn"
                      title="添加此技能"
                      onClick={() => handleInstall(skill.id)}
                    >
                      <Plus size={14} />
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="connector-connect-btn connector-connect-btn--try"
                        title="在对话中试一试该技能"
                        onClick={() => onTrySkill?.(skill)}
                      >
                        <Play size={11} fill="currentColor" />
                      </button>

                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          className={`skill-card-menu-btn${openMenuSkillId === skill.id ? ' is-open' : ''}`}
                          title="更多操作"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuSkillId((prev) => (prev === skill.id ? null : skill.id))
                          }}
                        >
                          <MoreHorizontal size={14} />
                        </button>

                        {openMenuSkillId === skill.id && (
                          <div className="skill-card-menu" onClick={(e) => e.stopPropagation()}>
                            <div
                              className="skill-card-menu-item"
                              onClick={() => {
                                setOpenMenuSkillId(null)
                                onTrySkill?.(skill)
                              }}
                            >
                              <Play size={12} fill="currentColor" />
                              <span>试一试</span>
                            </div>
                            <div
                              className="skill-card-menu-item"
                              onClick={() => {
                                setOpenMenuSkillId(null)
                                setConfiguringSkill(skill)
                              }}
                            >
                              <Settings size={12} />
                              <span>配置技能</span>
                            </div>
                            <div
                              className="skill-card-menu-item"
                              onClick={() => {
                                setOpenMenuSkillId(null)
                                handleToggleDisable(skill.id)
                              }}
                            >
                              <Power size={12} />
                              <span>{isDisabled ? '启用技能' : '禁用技能'}</span>
                            </div>
                            {!skill.isLocal && (
                              <div
                                className="skill-card-menu-item skill-card-menu-item--danger"
                                onClick={() => {
                                  setOpenMenuSkillId(null)
                                  handleUninstall(skill.id)
                                }}
                              >
                                <Trash2 size={12} />
                                <span>卸载技能</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="hub-inset-list">
          <div className="hub-empty-list">未搜索到匹配的技能</div>
        </div>
      )}

      <SkillConfigModal
        skill={configuringSkill}
        isOpen={configuringSkill !== null}
        onClose={() => setConfiguringSkill(null)}
      />
    </div>
  )
}
