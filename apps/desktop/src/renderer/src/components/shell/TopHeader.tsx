import React, { useEffect, useRef, useState } from 'react'
import {
  Check,
  Download,
  Search,
  Filter,
  FileText,
  MoreHorizontal,
  Maximize2,
  Minimize2,
  Pencil,
  Pin,
  PinOff,
  SlidersHorizontal,
  PanelRight,
  PanelBottom,
  Trash2,
  X,
  Sparkles,
  Wrench,
  Hammer,
  Settings2,
  Bookmark,
  Plus
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from '../icons/MingyiIcons'
import { topHeaderPlatformClass } from '@renderer/lib/platform'
import type { RightPanelSection } from './right-panel-vocabulary'
import { RIGHT_PANEL_SECTION_DEFINITIONS } from './right-panel-vocabulary'
import type { HubTab } from '../hub/hub-types'

interface TopHeaderProps {
  isSidebarCollapsed: boolean
  onToggleSidebar: () => void
  onNewTask?: (projectId?: string) => void
  onOpenSearch?: () => void
  /** When in a chat session: show session title bar controls instead of gift button */
  isInChat?: boolean
  taskTitle?: string
  taskPinned?: boolean
  onRenameTask?: (title: string) => void
  onToggleTaskPin?: () => void
  onDeleteTask?: () => void
  onExportTask?: () => void
  isRightPanelOpen?: boolean
  rightPanelWidth?: number
  activeRightPanelSection?: RightPanelSection
  onSelectRightPanelSection?: (section: RightPanelSection) => void
  isRightPanelExpanded?: boolean
  onToggleRightPanelExpanded?: () => void
  onToggleRightPanel?: () => void
  isBottomPanelOpen?: boolean
  onToggleBottomPanel?: () => void
  /** Hub mode integration */
  isHubMode?: boolean
  activeHubTab?: HubTab
  onSelectHubTab?: (tab: HubTab) => void
  hubSearchQuery?: string
  onHubSearchChange?: (query: string) => void
  onOpenMyItems?: () => void
}

/** Small icon button used in the header chrome */
function ChromeBtn({
  children,
  title,
  onClick,
  active = false
}: {
  children: React.ReactNode
  title?: string
  onClick?: () => void
  active?: boolean
}): React.ReactNode {
  return (
    <button
      className="app-no-drag"
      title={title}
      onClick={onClick}
      style={{
        width: '28px',
        height: '28px',
        backgroundColor: active ? '#e4e4e7' : 'transparent',
        border: 'none',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: active ? '#18181b' : '#555555',
        transition: 'background 0.15s ease'
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = active ? '#d4d4d8' : '#eaeaea')}
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = active ? '#e4e4e7' : 'transparent')
      }
    >
      {children}
    </button>
  )
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  onOpenSearch,
  isInChat = false,
  taskTitle = '',
  taskPinned = false,
  onRenameTask,
  onToggleTaskPin,
  onDeleteTask,
  onExportTask,
  isRightPanelOpen = false,
  rightPanelWidth = 380,
  activeRightPanelSection = 'pentest',
  onSelectRightPanelSection,
  isRightPanelExpanded = false,
  onToggleRightPanelExpanded,
  onToggleRightPanel,
  isBottomPanelOpen = false,
  onToggleBottomPanel,
  isHubMode = false,
  activeHubTab = 'expert',
  onSelectHubTab,
  hubSearchQuery = '',
  onHubSearchChange,
  onOpenMyItems
}) => {
  const actionsRef = useRef<HTMLDivElement>(null)
  const [taskMenuOpen, setTaskMenuOpen] = useState(false)
  const [taskMenuView, setTaskMenuView] = useState<'actions' | 'rename' | 'delete'>('actions')
  const [renameDraft, setRenameDraft] = useState('')
  const reducedMotion = useReducedMotion()
  const showRightPanelChrome = isInChat && isRightPanelOpen

  useEffect(() => {
    const closeFromOutside = (event: PointerEvent): void => {
      if (!actionsRef.current?.contains(event.target as Node)) setTaskMenuOpen(false)
    }
    const closeFromKeyboard = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setTaskMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeFromOutside)
    document.addEventListener('keydown', closeFromKeyboard)
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside)
      document.removeEventListener('keydown', closeFromKeyboard)
    }
  }, [])

  const commitRename = (): void => {
    const nextTitle = renameDraft.trim()
    if (nextTitle && nextTitle !== taskTitle) onRenameTask?.(nextTitle)
    setTaskMenuOpen(false)
  }

  return (
    <header
      className={`app-drag-region topheader ${topHeaderPlatformClass}${
        isSidebarCollapsed ? ' is-sidebar-collapsed' : ''
      }`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '42px',
        backgroundColor: 'transparent',
        borderBottom: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        // 左右内边距刻意留在 main.css 的 `.topheader--<platform>` 规则里：
        // macOS 让出红绿灯、Windows 让出系统窗口按钮区（env(titlebar-area-*)）。
        // 不要搬回内联样式，也不要换成 Tailwind 的 padding 工具类 ——
        // main.css 顶部的无层 `* { padding: 0 }` 会吃掉所有 Tailwind 间距类。
        userSelect: 'none',
        pointerEvents: 'none',
        zIndex: 200,
        transition: 'padding-left 0.28s cubic-bezier(0.2, 0, 0, 1)'
      }}
    >
      {/* ── Left: navigation controls + current task ── */}
      <div className="topheader-left-rail">
        <ChromeBtn
          title={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          onClick={onToggleSidebar}
        >
          {isSidebarCollapsed ? (
            <PanelLeftOpenIcon size={16} color="#555" />
          ) : (
            <PanelLeftCloseIcon size={16} color="#555" />
          )}
        </ChromeBtn>

        <ChromeBtn title="全局搜索 (⌘K)" onClick={onOpenSearch}>
          <Search size={15} color="#555" />
        </ChromeBtn>

        <ChromeBtn title="筛选">
          <Filter size={15} color="#555" />
        </ChromeBtn>

        {isInChat && taskTitle && !(showRightPanelChrome && isRightPanelExpanded) && (
          <div
            className={`topheader-task-title ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}
          >
            <FileText size={13} color="#71717a" style={{ flexShrink: 0 }} />
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#18181b',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {taskTitle}
            </span>
            <div ref={actionsRef} className="topheader-task-actions app-no-drag">
              <button
                className="topheader-task-more"
                type="button"
                aria-label={`当前任务“${taskTitle}”的更多操作`}
                aria-expanded={taskMenuOpen}
                aria-haspopup="menu"
                title="更多操作"
                onClick={() => {
                  setTaskMenuView('actions')
                  setTaskMenuOpen((open) => !open)
                }}
              >
                <MoreHorizontal size={14} />
              </button>
              <AnimatePresence initial={false}>
                {taskMenuOpen ? (
                  <motion.div
                    className="sidebar-task-menu topheader-task-menu"
                    role={
                      taskMenuView === 'actions'
                        ? 'menu'
                        : taskMenuView === 'delete'
                          ? 'alertdialog'
                          : 'dialog'
                    }
                    aria-label={
                      taskMenuView === 'actions'
                        ? `当前任务“${taskTitle}”操作`
                        : taskMenuView === 'delete'
                          ? `确认删除当前任务“${taskTitle}”`
                          : `重命名当前任务“${taskTitle}”`
                    }
                    initial={reducedMotion ? false : { opacity: 0, y: -3, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -2, scale: 0.98 }}
                    transition={
                      reducedMotion ? { duration: 0 } : { duration: 0.14, ease: [0.2, 0, 0, 1] }
                    }
                  >
                    {taskMenuView === 'rename' ? (
                      <div className="topheader-task-rename">
                        <label htmlFor="topheader-task-title">任务名称</label>
                        <input
                          id="topheader-task-title"
                          autoFocus
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              commitRename()
                            } else if (event.key === 'Escape') {
                              event.preventDefault()
                              setTaskMenuView('actions')
                            }
                          }}
                        />
                        <div>
                          <button type="button" onClick={() => setTaskMenuView('actions')}>
                            <X size={13} />
                            <span>取消</span>
                          </button>
                          <button
                            type="button"
                            disabled={!renameDraft.trim()}
                            onClick={commitRename}
                          >
                            <Check size={13} />
                            <span>保存</span>
                          </button>
                        </div>
                      </div>
                    ) : taskMenuView === 'delete' ? (
                      <div className="sidebar-task-delete-confirm">
                        <strong>删除这个任务？</strong>
                        <span>此操作无法撤销。</span>
                        <div>
                          <button type="button" onClick={() => setTaskMenuView('actions')}>
                            取消
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => {
                              onDeleteTask?.()
                              setTaskMenuOpen(false)
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
                            onToggleTaskPin?.()
                            setTaskMenuOpen(false)
                          }}
                        >
                          {taskPinned ? <PinOff size={14} /> : <Pin size={14} />}
                          <span>{taskPinned ? '取消置顶' : '置顶'}</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setRenameDraft(taskTitle)
                            setTaskMenuView('rename')
                          }}
                        >
                          <Pencil size={14} />
                          <span>重命名</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onExportTask?.()
                            setTaskMenuOpen(false)
                          }}
                        >
                          <Download size={14} />
                          <span>导出对话 (Markdown)</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="danger"
                          onClick={() => setTaskMenuView('delete')}
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
          </div>
        )}
      </div>

      {/* ── Hub Tabs (Positioned in main workspace top header) ── */}
      {isHubMode && (
        <div
          className="topheader-hub-nav app-no-drag"
          style={{
            position: 'absolute',
            left: isSidebarCollapsed ? '216px' : '260px',
            display: 'flex',
            alignItems: 'center',
            transition: 'left 0.28s cubic-bezier(0.2, 0, 0, 1)',
            pointerEvents: 'auto'
          }}
        >
          <div className="hub-header-tabs">
            <button
              className={`hub-header-tab ${activeHubTab === 'expert' ? 'is-active' : ''}`}
              onClick={() => onSelectHubTab?.('expert')}
            >
              <Sparkles size={13} />
              <span>专家</span>
            </button>
            <button
              className={`hub-header-tab ${activeHubTab === 'skill' ? 'is-active' : ''}`}
              onClick={() => onSelectHubTab?.('skill')}
            >
              <Wrench size={14} />
              <span>技能</span>
            </button>
            <button
              className={`hub-header-tab ${activeHubTab === 'tool' ? 'is-active' : ''}`}
              onClick={() => onSelectHubTab?.('tool')}
            >
              <Hammer size={13} />
              <span>连接器</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Right: panel controls (chat) or gift button (home) ── */}
      <div
        className={`topheader-right-rail${showRightPanelChrome ? ' is-contextual' : ''}${showRightPanelChrome && isRightPanelExpanded ? ' is-expanded' : ''}`}
        style={
          showRightPanelChrome
            ? isRightPanelExpanded
              ? {
                  left: isSidebarCollapsed ? 200 : 240,
                  right: 0,
                  transition: 'left 0.28s cubic-bezier(0.2, 0, 0, 1)'
                }
              : { right: 0, width: `min(${rightPanelWidth}px, calc(100% - 48px))` }
            : undefined
        }
      >
        {isInChat ? (
          <>
            {showRightPanelChrome ? (
              <nav className="topheader-panel-sections" aria-label="右侧工作台区段">
                {RIGHT_PANEL_SECTION_DEFINITIONS.map((section) => {
                  const Icon = section.icon
                  return (
                    <button
                      key={section.id}
                      type="button"
                      className={`topheader-panel-section${section.id === activeRightPanelSection ? ' is-active' : ''}`}
                      aria-label={section.label}
                      aria-pressed={section.id === activeRightPanelSection}
                      title={section.label}
                      onClick={() => onSelectRightPanelSection?.(section.id)}
                    >
                      <span className="topheader-panel-section-icon">
                        <Icon />
                      </span>
                      <span className="topheader-panel-section-label">{section.label}</span>
                    </button>
                  )
                })}
              </nav>
            ) : null}
            <div className="topheader-right-controls">
              <ChromeBtn title="筛选/设置">
                <SlidersHorizontal size={15} color="#52525b" />
              </ChromeBtn>
              {showRightPanelChrome ? (
                <ChromeBtn
                  title={isRightPanelExpanded ? '还原右侧工作台' : '展开右侧工作台'}
                  onClick={onToggleRightPanelExpanded}
                  active={isRightPanelExpanded}
                >
                  {isRightPanelExpanded ? (
                    <Minimize2 size={14} color="#18181b" />
                  ) : (
                    <Maximize2 size={14} color="#52525b" />
                  )}
                </ChromeBtn>
              ) : null}
              <ChromeBtn
                title={showRightPanelChrome ? '关闭右侧工作台' : '打开右侧工作台'}
                onClick={onToggleRightPanel}
                active={showRightPanelChrome}
              >
                <PanelRight size={15} color={showRightPanelChrome ? '#18181b' : '#52525b'} />
              </ChromeBtn>
              <ChromeBtn
                title={isBottomPanelOpen ? '隐藏底部终端 (⌘J)' : '打开底部终端 (⌘J)'}
                onClick={onToggleBottomPanel}
                active={isBottomPanelOpen}
              >
                <PanelBottom size={15} color={isBottomPanelOpen ? '#18181b' : '#52525b'} />
              </ChromeBtn>
            </div>
          </>
        ) : isHubMode ? (
          <div className="hub-header-right app-no-drag">
            <div className="hub-header-search-wrap">
              <Search size={14} className="hub-header-search-icon" />
              <input
                className="hub-header-search-input"
                placeholder={
                  activeHubTab === 'expert'
                    ? '搜索专家职称或描述'
                    : activeHubTab === 'skill'
                      ? '搜索技能名称或描述'
                      : '搜索连接器名称或功能描述'
                }
                value={hubSearchQuery}
                onChange={(e) => onHubSearchChange?.(e.currentTarget.value)}
              />
              {hubSearchQuery ? (
                <button
                  className="hub-header-search-clear"
                  aria-label="清空搜索"
                  onClick={() => onHubSearchChange?.('')}
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>

            {activeHubTab === 'expert' ? (
              <button
                className="hub-header-action-btn"
                onClick={onOpenMyItems}
                style={{ backgroundColor: '#18181b', color: '#ffffff' }}
              >
                <Plus size={13} />
                <span>新建专家</span>
              </button>
            ) : activeHubTab === 'skill' ? (
              <button className="hub-header-action-btn" onClick={onOpenMyItems}>
                <Bookmark size={13} />
                <span>技能管理</span>
              </button>
            ) : (
              <button className="hub-header-action-btn" onClick={onOpenMyItems}>
                <Settings2 size={13} />
                <span>自定义连接器</span>
              </button>
            )}
          </div>
        ) : null}
      </div>
    </header>
  )
}
