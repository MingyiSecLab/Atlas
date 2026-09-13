import React, { useState, useEffect, useCallback } from 'react'
import { TopHeader } from './components/shell/TopHeader'
import { Sidebar } from './components/shell/Sidebar'
import type { SidebarTask } from './components/shell/Sidebar'
import { MainWorkspace, type ChatImageAttachment } from './components/shell/MainWorkspace'
import { BottomTerminalPanel } from './components/shell/BottomTerminalPanel'
import { RightCapabilityPanel } from './components/shell/RightCapabilityPanel'
import {
  isRightPanelSection,
  type RightPanelSection
} from './components/shell/right-panel-vocabulary'
import { ChatWorkspace } from './components/chat/ChatWorkspace'
import { CommandPaletteModal } from './components/overlays/CommandPaletteModal'
import { SettingsModal } from './components/overlays/SettingsModal'
import { HubWorkspace } from './components/hub/HubWorkspace'
import type { HubTab, ExpertItem, SkillItem } from './components/hub/hub-types'
import type { RuntimeSkillInfo } from '@mingyi/runtime'
import { useWorkspace } from './state/WorkspaceProvider'
import { readSettings } from './components/overlays/settings/persistence'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import './assets/main.css'

function relativeTime(value: unknown): string {
  if (!value) return '刚刚'
  try {
    const elapsed = Math.max(0, Date.now() - new Date(value as string | number | Date).getTime())
    if (Number.isNaN(elapsed)) return '刚刚'
    const days = Math.floor(elapsed / (24 * 60 * 60 * 1000))
    if (days > 0) return `${days}天前`
    const hours = Math.floor(elapsed / (60 * 60 * 1000))
    if (hours > 0) return `${hours}小时前`
    return '刚刚'
  } catch {
    return '刚刚'
  }
}

export const App: React.FC = () => {
  const {
    workspace,
    error: workspaceError,
    modelIds,
    sessions,
    projects,
    createProject,
    loadSession,
    createSession,
    updateSession,
    deleteSession,
    sendMessage,
    invokeSkill,
    selectWorkspace,
    openProject
  } = useWorkspace()
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [activeNavMenu, setActiveNavMenu] = useState<string>('home')
  const [hubTab, setHubTab] = useState<HubTab>('expert')
  const [hubSearchQuery, setHubSearchQuery] = useState<string>('')
  const [isMyItemsOpen, setIsMyItemsOpen] = useState<boolean>(false)
  const [connectorConfigRequest, setConnectorConfigRequest] = useState(0)
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState<boolean>(false)
  const [isRightPanelOpen, setIsRightPanelOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mingyi_right_panel_open') === 'true'
    } catch {
      return false
    }
  })
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem('mingyi_right_panel_width'))
      return Number.isFinite(stored) && stored >= 320 && stored <= 640 ? stored : 380
    } catch {
      return 380
    }
  })
  const [rightPanelSection, setRightPanelSection] = useState<RightPanelSection>(() => {
    try {
      const stored = localStorage.getItem('mingyi_right_panel_section')
      return isRightPanelSection(stored) ? stored : 'pentest'
    } catch {
      return 'pentest'
    }
  })
  const [isRightPanelExpanded, setIsRightPanelExpanded] = useState(false)

  // Read initial collapse state from localStorage, matching Mingyi / Linkcode persistence
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mingyi_sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  // Save collapse state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('mingyi_sidebar_collapsed', String(isSidebarCollapsed))
    } catch {
      // ignore
    }
  }, [isSidebarCollapsed])

  useEffect(() => {
    try {
      localStorage.setItem('mingyi_right_panel_open', String(isRightPanelOpen))
    } catch {
      // ignore
    }
  }, [isRightPanelOpen])

  useEffect(() => {
    try {
      localStorage.setItem('mingyi_right_panel_width', String(rightPanelWidth))
    } catch {
      // ignore
    }
  }, [rightPanelWidth])

  useEffect(() => {
    try {
      localStorage.setItem('mingyi_right_panel_section', rightPanelSection)
    } catch {
      // ignore
    }
  }, [rightPanelSection])

  // Responsive auto-collapse when window is narrow
  useEffect(() => {
    const handleResize = (): void => {
      if (window.innerWidth < 840) {
        setIsSidebarCollapsed(true)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Global Keyboard Shortcuts: ⌘K for Search, ⌘, for Settings, ⌘J for Terminal Panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsSearchOpen((prev) => !prev)
      } else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setIsSettingsOpen((prev) => !prev)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setIsBottomPanelOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleNewTask = (projectId?: string): void => {
    setCurrentTaskId(null)
    setSelectedProjectId(projectId ?? null)
    setActiveNavMenu('home')
  }

  const handleSelectTask = (id: string): void => {
    const task = sessions.find((candidate) => candidate.id === id)
    setCurrentTaskId(id)
    setSelectedProjectId(task?.projectId ?? null)
    setActiveNavMenu('home')
    void loadSession(id)
  }

  const handleRenameTask = (id: string, title: string): void => {
    void updateSession({ sessionId: id, title })
  }

  const handleToggleTaskPin = (id: string): void => {
    const session = sessions.find((candidate) => candidate.id === id)
    if (session) void updateSession({ sessionId: id, pinned: !session.pinned })
  }

  const handleDeleteTask = (id: string): void => {
    void deleteSession(id).then(() => {
      setCurrentTaskId((current) => (current === id ? null : current))
    })
  }

  const handleToggleSidebar = (): void => {
    setIsSidebarCollapsed((prev) => !prev)
  }

  const handleToggleRightPanel = (): void => {
    if (isRightPanelOpen) setIsRightPanelExpanded(false)
    setIsRightPanelOpen((prev) => !prev)
  }

  const handleSendMessage = async (
    text: string,
    modelId?: string,
    mode?: string,
    options?: {
      attachments?: ChatImageAttachment[]
      goalMode?: boolean
      selectedSkill?: RuntimeSkillInfo
      selectedExpert?: ExpertItem
      projectId?: string | null
    }
  ): Promise<void> => {
    const title = options?.selectedExpert
      ? `${options.selectedExpert.title}: ${text.trim().slice(0, 24) || '新任务'}`
      : options?.selectedSkill
        ? `${options.selectedSkill.name}: ${text.trim().slice(0, 24) || '新任务'}`
        : text.trim().slice(0, 36) || (options?.attachments?.length ? '图片任务' : '新任务')
    const preferredModel = modelId ?? readSettings().defaultModel
    const session = await createSession({
      title,
      ...(preferredModel.includes('/') ? { modelId: preferredModel } : {}),
      permissionProfileId: mode ?? 'Pentest',
      ...(options?.projectId ? { projectId: options.projectId } : {})
    })
    setCurrentTaskId(session.id)
    setActiveNavMenu('home')
    if (options?.selectedSkill) {
      await invokeSkill({
        sessionId: session.id,
        skillName: options.selectedSkill.name,
        arguments: text.trim(),
        attachments: options?.attachments
      })
    } else {
      await sendMessage({
        sessionId: session.id,
        text: text.trim(),
        attachments: options?.attachments ?? [],
        ...(options?.goalMode ? { goalMode: options.goalMode } : {}),
        ...(options?.selectedExpert
          ? {
              expertPrompt: options.selectedExpert.systemPrompt,
              expertName: options.selectedExpert.name
            }
          : {})
      })
    }
    setSelectedProjectId(null)
  }

  const handleStartChatWithExpert = async (
    expert: ExpertItem,
    initialPrompt?: string
  ): Promise<void> => {
    const prompt = initialPrompt?.trim()
    const title = prompt ? `${expert.title}: ${prompt.slice(0, 24)}` : expert.title
    const preferredModel = readSettings().defaultModel
    const session = await createSession({
      title,
      ...(preferredModel.includes('/') ? { modelId: preferredModel } : {})
    })
    setCurrentTaskId(session.id)
    setActiveNavMenu('home')
    if (prompt) {
      await sendMessage({
        sessionId: session.id,
        text: prompt,
        attachments: []
      })
    }
  }

  const handleTrySkill = async (skill: SkillItem): Promise<void> => {
    const preferredModel = readSettings().defaultModel
    const session = await createSession({
      title: `${skill.name}`,
      ...(preferredModel.includes('/') ? { modelId: preferredModel } : {})
    })
    setCurrentTaskId(session.id)
    setActiveNavMenu('home')
    if (skill.isLocal) {
      // 本地技能直接注入真实的 SKILL.md 激活指令；失败时回退为普通问候。
      try {
        await window.api.skills.invoke({ sessionId: session.id, name: skill.identifier })
        return
      } catch (error) {
        console.error('激活本地技能失败：', error)
      }
    }
    await sendMessage({
      sessionId: session.id,
      text: `你好！我正在试用「${skill.name}」技能。请告诉我你能帮我完成什么，或者直接提供相关示例。`,
      attachments: []
    })
  }

  const handleTryConnector = async (connectorName: string): Promise<void> => {
    const preferredModel = readSettings().defaultModel
    const session = await createSession({
      title: `${connectorName}`,
      ...(preferredModel.includes('/') ? { modelId: preferredModel } : {})
    })
    setCurrentTaskId(session.id)
    setActiveNavMenu('home')
    await sendMessage({
      sessionId: session.id,
      text: `你好！我已连接「${connectorName}」。请帮我对目标进行检测，或告诉我如何调用相关工具。`,
      attachments: []
    })
  }

  const tasks: SidebarTask[] = (sessions ?? []).map((session) => ({
    id: session.id,
    title: session.title || '无标题任务',
    time: relativeTime(session.updatedAt),
    pinned: session.pinned,
    projectId: session.projectId,
    projectPath: session.projectPath,
    isRunning: session.isRunning
  }))
  const currentTask = tasks.find((task) => task.id === currentTaskId)
  const isHubActive = !currentTaskId && activeNavMenu === 'expert'
  const handlePickFolderForTask = useCallback(async (): Promise<string | null> => {
    try {
      const rootPath = await window.api.projects.pickFolder()
      if (!rootPath) return null
      const existingProjects = await window.api.projects.list()
      let project = existingProjects.find(
        (p) => p.rootPath.replace(/[/\\]+$/, '') === rootPath.replace(/[/\\]+$/, '')
      )
      if (!project) {
        project = await createProject({ rootPath })
      }
      await openProject(project.id)
      setSelectedProjectId(project.id)
      return project.id
    } catch (error) {
      console.error('选择空间目录失败：', error)
      return null
    }
  }, [createProject, openProject])

  return (
    <ErrorBoundary
      fallbackTitle="Mingyi 客户端遇到异常"
      fallbackMessage="页面组件渲染发生意外错误，已拦截保护避免白屏，点击下方按钮即可重新加载。"
      showHomeButton
      onGoHome={() => {
        setCurrentTaskId(null)
        setActiveNavMenu('home')
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100vw',
          height: '100vh',
          overflow: 'hidden'
        }}
      >
        {/* Linkcode style: Global Fixed Top Header */}
        <TopHeader
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={handleToggleSidebar}
          onNewTask={handleNewTask}
          onOpenSearch={() => setIsSearchOpen(true)}
          isInChat={!!currentTaskId}
          taskTitle={currentTask?.title}
          taskPinned={currentTask?.pinned}
          onRenameTask={(title) => {
            if (currentTask) handleRenameTask(currentTask.id, title)
          }}
          onToggleTaskPin={() => {
            if (currentTask) handleToggleTaskPin(currentTask.id)
          }}
          onDeleteTask={() => {
            if (currentTask) handleDeleteTask(currentTask.id)
          }}
          isRightPanelOpen={isRightPanelOpen}
          rightPanelWidth={rightPanelWidth}
          activeRightPanelSection={rightPanelSection}
          onSelectRightPanelSection={setRightPanelSection}
          isRightPanelExpanded={isRightPanelExpanded}
          onToggleRightPanelExpanded={() => setIsRightPanelExpanded((prev) => !prev)}
          onToggleRightPanel={handleToggleRightPanel}
          isBottomPanelOpen={isBottomPanelOpen}
          onToggleBottomPanel={() => setIsBottomPanelOpen((prev) => !prev)}
          isHubMode={isHubActive}
          activeHubTab={hubTab}
          onSelectHubTab={setHubTab}
          hubSearchQuery={hubSearchQuery}
          onHubSearchChange={setHubSearchQuery}
          onOpenMyItems={() => {
            if (hubTab === 'tool') setConnectorConfigRequest((value) => value + 1)
            else setIsMyItemsOpen(true)
          }}
        />

        {/* Main Body below Top Header */}
        <div style={{ display: 'flex', flex: 1, width: '100%', overflow: 'hidden' }}>
          <Sidebar
            isCollapsed={isSidebarCollapsed}
            onNewTask={handleNewTask}
            currentTaskId={currentTaskId}
            tasks={tasks}
            onSelectTask={handleSelectTask}
            onRenameTask={handleRenameTask}
            onToggleTaskPin={handleToggleTaskPin}
            onDeleteTask={handleDeleteTask}
            onOpenSearch={() => setIsSearchOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            activeMenu={activeNavMenu}
            onSelectMenu={(menuId) => {
              setActiveNavMenu(menuId)
              if (menuId === 'expert') {
                setCurrentTaskId(null)
              }
            }}
            projects={projects.map((project) => ({
              id: project.id,
              name: project.name,
              rootPath: project.rootPath,
              isActive: project.isActive
            }))}
            onOpenProject={(projectId) => {
              void openProject(projectId)
              setCurrentTaskId(null)
            }}
          />

          <div className="desktop-workbench">
            <div className="desktop-workbench-primary">
              <ErrorBoundary
                fallbackTitle="对话工作区加载异常"
                fallbackMessage="此对话记录或消息渲染时遇到非预期数据，点击重试重新载入，或返回主页。"
                showHomeButton
                onGoHome={() => {
                  setCurrentTaskId(null)
                  setActiveNavMenu('home')
                }}
                onReset={() => {
                  if (currentTaskId) void loadSession(currentTaskId)
                }}
              >
                {currentTaskId ? (
                  <ChatWorkspace
                    taskId={currentTaskId}
                    taskTitle={currentTask?.title}
                    isSidebarCollapsed={isSidebarCollapsed}
                    onNewTask={handleNewTask}
                  />
                ) : activeNavMenu === 'expert' ? (
                  <HubWorkspace
                    activeTab={hubTab}
                    searchQuery={hubSearchQuery}
                    isMyItemsOpen={isMyItemsOpen}
                    onCloseMyItems={() => setIsMyItemsOpen(false)}
                    openConnectorConfig={connectorConfigRequest}
                    onStartChatWithExpert={handleStartChatWithExpert}
                    onTrySkill={handleTrySkill}
                    onTryConnector={handleTryConnector}
                  />
                ) : (
                  <MainWorkspace
                    onSendMessage={handleSendMessage}
                    workspace={workspace}
                    projects={projects.map((project) => ({
                      id: project.id,
                      name: project.name,
                      rootPath: project.rootPath
                    }))}
                    selectedProjectId={selectedProjectId}
                    onSelectProject={setSelectedProjectId}
                    onPickFolder={handlePickFolderForTask}
                    runtimeError={workspaceError}
                    modelIds={modelIds}
                    onSelectWorkspace={() => void selectWorkspace()}
                  />
                )}
              </ErrorBoundary>

              {/* Linkcode style: Bottom Terminal Panel (⌘J) */}
              <BottomTerminalPanel
                isOpen={isBottomPanelOpen}
                onClose={() => setIsBottomPanelOpen(false)}
              />
            </div>

            {currentTaskId && isRightPanelOpen ? (
              <ErrorBoundary
                fallbackTitle="右侧能力面板遇到问题"
                fallbackMessage="右侧能力组件加载异常，已自动保护，您可以重新加载或切换其他视图。"
                onReset={() => {
                  // retry
                }}
              >
                <RightCapabilityPanel
                  activeSection={rightPanelSection}
                  isExpanded={isRightPanelExpanded}
                  width={rightPanelWidth}
                  onResize={setRightPanelWidth}
                  onSelectSection={setRightPanelSection}
                />
              </ErrorBoundary>
            ) : null}
          </div>
        </div>

        {/* Linkcode style: Command Palette Search Modal (⌘K) */}
        <CommandPaletteModal
          isOpen={isSearchOpen}
          threads={tasks}
          onClose={() => setIsSearchOpen(false)}
          onSelectTask={handleSelectTask}
          onNewTask={handleNewTask}
        />

        {/* Linkcode style: Settings Modal (⌘,) */}
        <SettingsModal
          isOpen={isSettingsOpen}
          modelIds={modelIds}
          onClose={() => setIsSettingsOpen(false)}
        />
      </div>
    </ErrorBoundary>
  )
}

export default App
