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
  // Custom & System Experts State（自定义专家持久化在工作区磁盘，经 IPC 读写）
  const [customExperts, setCustomExperts] = useState<ExpertItem[]>([])
  const [systemExperts] = useState<ExpertItem[]>(SYSTEM_BUILTIN_EXPERTS)

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
        const saved = await window.api.experts.save(expertItemToSaveInput(savedExpert))
        // mode 注册需工作区重连；列表以磁盘扫描结果为准
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
    void (async () => {
      try {
        await window.api.experts.delete(expertId)
        await reloadExperts()
      } catch (error) {
        console.error('删除专家失败：', error)
      }
    })()
  }

  const isModalVisible = isEditModalOpen || (isMyItemsOpen && activeTab === 'expert')

  return (
    <div className="hub-root">
      <div className="hub-content-scroll">
        {activeTab === 'expert' && (
          <ExpertCardGrid
            customExperts={customExperts}
            systemExperts={systemExperts}
            searchQuery={searchQuery}
            onSelectExpert={(expert) => setSelectedExpert(expert)}
            onStartChat={(expert) => onStartChatWithExpert(expert)}
            onEditExpert={handleEditExpert}
            onDeleteExpert={handleDeleteExpert}
            onCloneExpert={handleCloneExpert}
          />
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
