import React, { useCallback, useState, useEffect } from 'react'
import type { RuntimeSkillInfo } from '@mingyi/runtime'
import type { HubTab, ExpertItem, SkillItem, ToolItem } from './hub-types'
import {
  SYSTEM_BUILTIN_EXPERTS,
  SYSTEM_SKILLS,
  SYSTEM_TOOLS,
  expertDefinitionsToItems,
  expertItemToSaveInput
} from './hub-data'
import { ExpertCardGrid } from './ExpertCardGrid'
import { ExpertDetailModal } from './ExpertDetailModal'
import { ExpertEditModal } from './ExpertEditModal'
import { SkillCenter } from './SkillCenter'
import { ToolCenter } from './ToolCenter'
import './hub.css'

interface HubWorkspaceProps {
  activeTab: HubTab
  searchQuery: string
  isMyItemsOpen: boolean
  onCloseMyItems: () => void
  openConnectorConfig?: number
  onStartChatWithExpert: (expert: ExpertItem, initialPrompt?: string) => void
  onTrySkill?: (skill: SkillItem) => void
  onTryConnector?: (connectorName: string) => void
}

const STORAGE_DELETED_BUILTINS = 'atlas_deleted_builtin_experts'

function getDeletedBuiltinIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_DELETED_BUILTINS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveDeletedBuiltinIds(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_DELETED_BUILTINS, JSON.stringify(ids))
  } catch {
    // ignore
  }
}

export const HubWorkspace: React.FC<HubWorkspaceProps> = ({
  activeTab,
  searchQuery,
  isMyItemsOpen,
  onCloseMyItems,
  openConnectorConfig,
  onStartChatWithExpert,
  onTrySkill,
  onTryConnector
}) => {
  // Custom & System Experts State（自定义专家持久化在工作区磁盘，内置专家可由用户删除隐藏）
  const [customExperts, setCustomExperts] = useState<ExpertItem[]>([])
  const [deletedBuiltinIds, setDeletedBuiltinIds] = useState<string[]>(getDeletedBuiltinIds)
  const visibleSystemExperts = SYSTEM_BUILTIN_EXPERTS.filter(
    (e) => !deletedBuiltinIds.includes(e.id)
  )

  // Modals state
  const [selectedExpert, setSelectedExpert] = useState<ExpertItem | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [expertToEdit, setExpertToEdit] = useState<ExpertItem | null>(null)

  // Skills & Tools state
  const [localSkills, setLocalSkills] = useState<SkillItem[]>([])
  const [skills] = useState<SkillItem[]>(SYSTEM_SKILLS)
  const [tools] = useState<ToolItem[]>(SYSTEM_TOOLS)

  const reloadExperts = useCallback(async (): Promise<void> => {
    const scan = await window.api.experts.list()
    setCustomExperts(expertDefinitionsToItems(scan.experts))
  }, [])

  useEffect(() => {
    let cancelled = false
    // 本地技能来自 Runtime 工作区扫描（如 .agents/skills、~/.agents/skills 下的 SKILL.md），
    // 无需会话上下文；加载失败时仅展示系统内置技能。
    window.api.skills
      .list({})
      .then((infos: RuntimeSkillInfo[]) => {
        if (cancelled) return
        setLocalSkills(
          infos.map((info) => ({
            id: `local:${info.name}`,
            name: info.name,
            identifier: info.name,
            author: '本地',
            description: info.description,
            categories: ['本地技能'],
            tags: [],
            isEnabled: true,
            isLocal: true,
            sourcePath: info.path
          }))
        )
      })
      .catch(() => {
        // 工作区技能扫描失败保持空列表；具体原因由主进程日志记录。
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    // 订阅外部系统（主进程专家目录扫描），异步回调里更新状态
    window.api.experts
      .list()
      .then((scan) => {
        if (!cancelled) setCustomExperts(expertDefinitionsToItems(scan.experts))
      })
      .catch(() => {
        // 首次扫描失败保持空列表；具体原因由主进程日志记录。
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleEditExpert = (expert: ExpertItem): void => {
    setExpertToEdit(expert)
    setIsEditModalOpen(true)
  }

  const handleCloneExpert = (expert: ExpertItem): void => {
    setExpertToEdit({
      ...expert,
      id: '',
      title: `${expert.title} (副本)`,
      name: `${expert.name} (副本)`,
      isCustom: true,
      createdAt: new Date().toISOString()
    })
    setIsEditModalOpen(true)
  }

  const handleSaveExpert = (savedExpert: ExpertItem): void => {
    void (async () => {
      try {
        // 若编辑的是系统预置角色，保存到工作区的同时将原内置预置项自动隐藏，避免列表重复
        if (expertToEdit && expertToEdit.id.startsWith('builtin_')) {
          const updated = Array.from(new Set([...deletedBuiltinIds, expertToEdit.id]))
          saveDeletedBuiltinIds(updated)
          setDeletedBuiltinIds(updated)
        }
        const saved = await window.api.experts.save(expertItemToSaveInput(savedExpert))
        await reloadExperts()
        if (saved.requiresRestart) {
          console.info(
            `专家「${savedExpert.name}」已保存到 ${saved.path}；重启应用或切换工作区后可在会话中激活。`
          )
        }
      } catch (error) {
        console.error('保存专家失败：', error)
      }
    })()
  }

  const handleDeleteExpert = (expertId: string): void => {
    // 若是系统预置专家，存入本地删除名单并从视图中隐藏
    if (expertId.startsWith('builtin_')) {
      const updated = Array.from(new Set([...deletedBuiltinIds, expertId]))
      saveDeletedBuiltinIds(updated)
      setDeletedBuiltinIds(updated)
      if (selectedExpert?.id === expertId) setSelectedExpert(null)
      return
    }
    void (async () => {
      try {
        await window.api.experts.delete(expertId)
        await reloadExperts()
        if (selectedExpert?.id === expertId) setSelectedExpert(null)
      } catch (error) {
        console.error('删除专家失败：', error)
      }
    })()
  }

  const handleResetBuiltinExperts = (): void => {
    saveDeletedBuiltinIds([])
    setDeletedBuiltinIds([])
  }

  const isModalVisible = isEditModalOpen || (isMyItemsOpen && activeTab === 'expert')

  return (
    <div className="hub-root">
      <div className="hub-content-scroll">
        {activeTab === 'expert' && (
          <>
            {deletedBuiltinIds.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  marginBottom: '12px',
                  borderRadius: '6px',
                  backgroundColor: '#f4f4f5',
                  fontSize: '12px',
                  color: '#71717a'
                }}
              >
                <span>已隐藏 {deletedBuiltinIds.length} 个预置专家角色</span>
                <button
                  type="button"
                  onClick={handleResetBuiltinExperts}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#2563eb',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 500
                  }}
                >
                  恢复全部预置专家
                </button>
              </div>
            )}
            <ExpertCardGrid
              customExperts={customExperts}
              systemExperts={visibleSystemExperts}
              searchQuery={searchQuery}
              onSelectExpert={(expert) => setSelectedExpert(expert)}
              onStartChat={(expert) => onStartChatWithExpert(expert)}
              onEditExpert={handleEditExpert}
              onDeleteExpert={handleDeleteExpert}
              onCloneExpert={handleCloneExpert}
            />
          </>
        )}

        {activeTab === 'skill' && (
          <SkillCenter
            skills={[...localSkills, ...skills]}
            searchQuery={searchQuery}
            onTrySkill={onTrySkill}
          />
        )}

        {activeTab === 'tool' && (
          <ToolCenter
            tools={tools}
            searchQuery={searchQuery}
            openConfigRequest={openConnectorConfig}
            onTryConnector={onTryConnector}
          />
        )}
      </div>

      {/* Expert Detail Modal */}
      <ExpertDetailModal
        expert={selectedExpert}
        onClose={() => setSelectedExpert(null)}
        onStartChat={onStartChatWithExpert}
        onEdit={handleEditExpert}
        onDelete={handleDeleteExpert}
      />

      {/* Create / Edit Expert Modal */}
      <ExpertEditModal
        isOpen={isModalVisible}
        expertToEdit={expertToEdit}
        onClose={() => {
          setIsEditModalOpen(false)
          setExpertToEdit(null)
          onCloseMyItems()
        }}
        onSave={handleSaveExpert}
      />
    </div>
  )
}
