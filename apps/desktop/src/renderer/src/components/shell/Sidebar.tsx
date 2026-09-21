import React, { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Folder,
  Sparkles,
  Blocks,
  ChevronDown,
  ChevronRight,
  Check,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  X
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { SidebarFooter } from './sidebar-footer'
import type { SettingsPage } from '../overlays/settings/types'

export interface SidebarTask {
  id: string
  title: string
  time: string
  pinned?: boolean
  projectId?: string | null
  projectPath?: string
  isRunning?: boolean
}

export interface SidebarProject {
  id: string
  name: string
  rootPath?: string
  isActive?: boolean
}

interface SidebarProps {
  isCollapsed: boolean
  onNewTask: (projectId?: string) => void
  currentTaskId: string | null
  tasks: SidebarTask[]
  onSelectTask: (id: string) => void
  onRenameTask: (id: string, title: string) => void
  onToggleTaskPin: (id: string) => void
  onDeleteTask: (id: string) => void
  onOpenSearch?: () => void
  /** 打开应用设置；传入页面时直接定位（侧栏新版本角标跳「关于与更新」）。 */
  onOpenSettings?: (page?: SettingsPage) => void
  activeMenu?: string
  onSelectMenu?: (menuId: string) => void
  projects?: SidebarProject[]
  onOpenProject?: (id: string) => void
}

const GROUP_STATE_KEY = 'mingyi_sidebar_groups'

type GroupKey = string

function readGroupState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(GROUP_STATE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function writeGroupState(state: Record<string, boolean>): void {
  try {
    localStorage.setItem(GROUP_STATE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

/**
 * 按空间归属分组任务：projectId 为空的进临时对话组；
 * 只有 projectPath 的旧任务按路径反查登记项目归组，反查不到也进临时组。
 */
function groupTasks(
  tasks: SidebarTask[],
  projects: SidebarProject[]
): {
  temporary: SidebarTask[]
  byProject: Array<{ project: SidebarProject; tasks: SidebarTask[] }>
} {
  const pathToId = new Map(
    projects.filter((project) => project.rootPath).map((project) => [project.rootPath!, project.id])
  )
  const temporary: SidebarTask[] = []
  const byProject = new Map<string, SidebarTask[]>()
  for (const task of tasks) {
    const pathOwner = pathToId.get(task.projectPath ?? '')
    const projectId = task.projectId ?? pathOwner
    if (projectId && projects.some((project) => project.id === projectId)) {
      const bucket = byProject.get(projectId) ?? []
      bucket.push(task)
      byProject.set(projectId, bucket)
    } else {
      temporary.push(task)
    }
  }
  return {
    temporary,
    byProject: projects.map((project) => ({ project, tasks: byProject.get(project.id) ?? [] }))
  }
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onNewTask,
  currentTaskId,
  tasks,
  onSelectTask,
  onRenameTask,
  onToggleTaskPin,
  onDeleteTask,
  onOpenSettings,
  activeMenu: propActiveMenu,
  onSelectMenu,
  projects,
  onOpenProject
}) => {
  const [internalActiveMenu, setInternalActiveMenu] = useState('home')
  const activeMenu = propActiveMenu ?? internalActiveMenu
  const [activeTaskMenuId, setActiveTaskMenuId] = useState<string | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [groupState, setGroupState] = useState<Record<GroupKey, boolean>>(readGroupState)
  const reducedMotion = useReducedMotion()

  const projectList = useMemo(() => projects ?? [], [projects])
  const grouped = useMemo(() => groupTasks(tasks, projectList), [tasks, projectList])

  const toggleGroup = (key: GroupKey): void => {
    setGroupState((current) => {
      const next = { ...current, [key]: !current[key] }
      writeGroupState(next)
      return next
    })
  }

  useEffect(() => {
    const closeTaskMenu = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-task-actions]')) return
      setActiveTaskMenuId(null)
      setPendingDeleteId(null)
    }
    const closeFromKeyboard = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setActiveTaskMenuId(null)
      setPendingDeleteId(null)
      setEditingTaskId(null)
    }
    document.addEventListener('pointerdown', closeTaskMenu)
    document.addEventListener('keydown', closeFromKeyboard)
    return () => {
      document.removeEventListener('pointerdown', closeTaskMenu)
      document.removeEventListener('keydown', closeFromKeyboard)
    }
  }, [])

  const beginRename = (task: SidebarTask): void => {
    setRenameDraft(task.title)
    setEditingTaskId(task.id)
    setActiveTaskMenuId(null)
    setPendingDeleteId(null)
  }

  const commitRename = (task: SidebarTask): void => {
    const nextTitle = renameDraft.trim()
    if (nextTitle && nextTitle !== task.title) onRenameTask(task.id, nextTitle)
    setEditingTaskId(null)
  }

  const effectiveActiveTaskMenuId = isCollapsed ? null : activeTaskMenuId
  const effectiveEditingTaskId = isCollapsed ? null : editingTaskId
  const effectivePendingDeleteId = isCollapsed ? null : pendingDeleteId

  const renderTask = (task: SidebarTask): React.ReactNode => {
    const isSelected = currentTaskId === task.id
    const isMenuOpen = effectiveActiveTaskMenuId === task.id
    const isEditing = effectiveEditingTaskId === task.id
    return (
      <div
        key={task.id}
        className={`sidebar-task-row app-no-drag${isSelected ? ' is-selected' : ''}${isMenuOpen ? ' is-menu-open' : ''}`}
      >
        {isEditing ? (
          <div className="sidebar-task-rename" data-task-actions>
            <input
              autoFocus
              aria-label={`重命名任务“${task.title}”`}
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitRename(task)
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  setEditingTaskId(null)
                }
              }}
            />
            <button
              type="button"
              aria-label="保存名称"
              title="保存"
              disabled={!renameDraft.trim()}
              onClick={() => commitRename(task)}
            >
              <Check size={13} />
            </button>
            <button
              type="button"
              aria-label="取消重命名"
              title="取消"
              onClick={() => setEditingTaskId(null)}
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <>
            <button
              className="sidebar-task-main"
              type="button"
              onClick={() => onSelectTask(task.id)}
            >
              {task.isRunning ? (
                <span
                  className="sidebar-task-status is-running"
                  aria-label="运行中"
                  title="运行中"
                />
              ) : null}
              {task.pinned ? (
                <Pin className="sidebar-task-pin" size={11} aria-label="已置顶" />
              ) : null}
              <span className="sidebar-task-title">{task.title}</span>
              <span className="sidebar-task-time">{task.time}</span>
            </button>
            <div className="sidebar-task-actions" data-task-actions>
              <button
                className="sidebar-task-more"
                type="button"
                aria-label={`任务“${task.title}”的更多操作`}
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                title="更多操作"
                onClick={() => {
                  setPendingDeleteId(null)
                  setActiveTaskMenuId(isMenuOpen ? null : task.id)
                }}
              >
                <MoreHorizontal size={15} />
              </button>
              <AnimatePresence initial={false}>
                {isMenuOpen ? (
                  <motion.div
                    className="sidebar-task-menu"
                    role={effectivePendingDeleteId === task.id ? 'alertdialog' : 'menu'}
                    aria-label={
                      effectivePendingDeleteId === task.id
                        ? `确认删除任务“${task.title}”`
                        : `任务“${task.title}”操作`
                    }
                    initial={reducedMotion ? false : { opacity: 0, y: -3, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -2, scale: 0.98 }}
                    transition={
                      reducedMotion ? { duration: 0 } : { duration: 0.14, ease: [0.2, 0, 0, 1] }
                    }
                  >
                    {effectivePendingDeleteId === task.id ? (
                      <div className="sidebar-task-delete-confirm">
                        <strong>删除这个任务？</strong>
                        <span>此操作无法撤销。</span>
                        <div>
                          <button type="button" onClick={() => setPendingDeleteId(null)}>
                            取消
                          </button>
                          <button
                            className="is-danger"
                            type="button"
                            onClick={() => {
                              onDeleteTask(task.id)
                              setActiveTaskMenuId(null)
                              setPendingDeleteId(null)
                            }}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onToggleTaskPin(task.id)
                            setActiveTaskMenuId(null)
                          }}
                        >
                          {task.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                          <span>{task.pinned ? '取消置顶' : '置顶'}</span>
                        </button>
                        <button type="button" role="menuitem" onClick={() => beginRename(task)}>
                          <Pencil size={14} />
                          <span>重命名</span>
                        </button>
                        <div className="sidebar-task-menu-separator" />
                        <button
                          className="is-danger"
                          type="button"
                          role="menuitem"
                          onClick={() => setPendingDeleteId(task.id)}
                        >
                          <Trash2 size={14} />
                          <span>删除</span>
                        </button>
                      </>
                    )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    )
  }

  const menuItems = [
    { id: 'new_task', label: '新建任务', icon: Plus, action: () => onNewTask() },
    { id: 'expert', label: '扩展中心', icon: Sparkles },
    { id: 'extension', label: '插件', icon: Blocks }
  ]

  const sectionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    fontSize: '12px',
    color: '#86868b',
    fontWeight: 500,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    boxShadow: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    fontFamily: 'inherit'
  }

  return (
    <aside
      className="app-sidebar"
      style={{
        width: isCollapsed ? 0 : '240px',
        height: '100%',
        backgroundColor: '#f5f5f7',
        borderRight: isCollapsed ? '1px solid transparent' : '1px solid #e5e5ea',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        flexShrink: 0,
        transition:
          'width 0.28s cubic-bezier(0.2, 0, 0, 1), border-color 0.28s cubic-bezier(0.2, 0, 0, 1)',
        overflow: isCollapsed ? 'hidden' : 'visible',
        position: 'relative',
        zIndex: 110,
        pointerEvents: isCollapsed ? 'none' : 'auto'
      }}
    >
      {/* Fixed-width inner container prevents text reflow and squishing during width animation */}
      <div
        style={{
          width: '240px',
          minWidth: '240px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: '42px' // Spacer for top titlebar overlay
        }}
      >
        {/* Scrollable Navigation Area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '4px 8px'
          }}
        >
          {/* Navigation Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = activeMenu === item.id
              return (
                <div
                  key={item.id}
                  className="app-no-drag"
                  onClick={() => {
                    setInternalActiveMenu(item.id)
                    onSelectMenu?.(item.id)
                    if (item.action) item.action()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: isActive ? '#000000' : '#424245',
                    fontWeight: isActive ? 600 : 400,
                    backgroundColor: isActive ? '#e2e2e6' : 'transparent',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = '#eaeaea'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <Icon size={16} color={isActive ? '#000000' : '#666666'} />
                  <span>{item.label}</span>
                </div>
              )
            })}
          </div>

          <div style={{ height: '16px' }} />

          {/* Section: Temporary tasks (no project binding) */}
          <div>
            <button
              type="button"
              className="sidebar-section-header app-no-drag"
              aria-expanded={!groupState['tasks']}
              onClick={() => toggleGroup('tasks')}
              style={sectionHeaderStyle}
            >
              <span>任务 ({grouped.temporary.length})</span>
              {groupState['tasks'] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>

            {!groupState['tasks'] && (
              <div className="sidebar-task-list">
                {grouped.temporary.length === 0 ? (
                  <div className="sidebar-task-empty">暂无任务</div>
                ) : null}
                {grouped.temporary.map(renderTask)}
              </div>
            )}
          </div>

          <div style={{ height: '16px' }} />

          {/* Section: Spaces — each project groups its own tasks */}
          <div>
            <button
              type="button"
              className="sidebar-section-header app-no-drag"
              aria-expanded={!groupState['spaces']}
              onClick={() => toggleGroup('spaces')}
              style={sectionHeaderStyle}
            >
              <span>空间 ({projectList.length})</span>
              {groupState['spaces'] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>

            {!groupState['spaces'] && (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginTop: '4px' }}
              >
                {projectList.length === 0 ? (
                  <div
                    className="app-no-drag"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px 6px 14px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: '#333336',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e8e8ec')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Folder size={14} color="#555" />
                      <span>项目新手指引</span>
                    </div>
                    <ChevronRight size={14} color="#999" />
                  </div>
                ) : (
                  projectList.map((project) => {
                    const isActive = Boolean(project.isActive)
                    const groupKey = `space:${project.id}`
                    const projectTasks = grouped.byProject.find(
                      (group) => group.project.id === project.id
                    )?.tasks
                    const collapsed = Boolean(groupState[groupKey])
                    return (
                      <div key={project.id}>
                        <div
                          className="app-no-drag"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px 6px 14px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: isActive ? 600 : 400,
                            color: isActive ? '#000000' : '#333336',
                            backgroundColor: isActive ? '#e2e2e6' : 'transparent'
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) e.currentTarget.style.backgroundColor = '#e8e8ec'
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                          }}
                        >
                          <button
                            type="button"
                            aria-expanded={!collapsed}
                            aria-label={`展开空间“${project.name}”`}
                            title={project.rootPath ?? project.name}
                            onClick={() => toggleGroup(groupKey)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              overflow: 'hidden',
                              flex: 1,
                              cursor: 'pointer',
                              textAlign: 'left',
                              background: 'transparent',
                              border: 'none',
                              padding: 0,
                              font: 'inherit',
                              color: 'inherit',
                              fontWeight: 'inherit'
                            }}
                          >
                            {collapsed ? (
                              <ChevronRight size={13} color="#999" />
                            ) : (
                              <ChevronDown size={13} color="#999" />
                            )}
                            <Folder size={14} color={isActive ? '#000' : '#555'} />
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {project.name}
                              {projectTasks?.length ? ` (${projectTasks.length})` : ''}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="app-no-drag"
                            aria-label={`在空间“${project.name}”中新建任务`}
                            title="在此空间新建任务"
                            onClick={() => onNewTask(project.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 22,
                              height: 22,
                              borderRadius: 5,
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              color: '#666'
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.08)')
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.backgroundColor = 'transparent')
                            }
                          >
                            <Plus size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label={`打开空间“${project.name}”`}
                            title="打开空间"
                            onClick={() => onOpenProject?.(project.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 22,
                              height: 22,
                              borderRadius: 5,
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              color: '#999'
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.08)')
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.backgroundColor = 'transparent')
                            }
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                        {!collapsed && projectTasks?.length ? (
                          <div style={{ paddingLeft: '10px' }}>{projectTasks.map(renderTask)}</div>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>

        <SidebarFooter isCollapsed={isCollapsed} onOpenSettings={onOpenSettings} />
      </div>
    </aside>
  )
}
