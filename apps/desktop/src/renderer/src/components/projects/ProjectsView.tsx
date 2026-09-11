import React, { useCallback, useState } from 'react'
import { Folder, Edit3, Trash2, X, Check, Play, CircleAlert, Plus } from 'lucide-react'
import type { DesktopProjectInfo } from '../../../../shared/runtime-ipc'
import { useWorkspace } from '../../state/WorkspaceProvider'
import '../hub/hub.css'
import './projects.css'

interface ProjectsViewProps {
  /** 打开项目成功后的回调（返回主页）。 */
  onOpened?: () => void
  /** 顶部全局搜索词 */
  searchQuery?: string
  /** 外部触发新建项目 */
  onCreateProject?: () => void
}

function relativeTime(value?: string): string {
  if (!value) return '尚未打开'
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return '尚未打开'
  const diff = Date.now() - time
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '刚刚打开'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(time).toLocaleDateString('zh-CN')
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  onOpened,
  searchQuery = '',
  onCreateProject
}) => {
  const { projects, error, openProject, renameProject, removeProject } = useWorkspace()
  const [busy, setBusy] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)

  const handleOpen = useCallback(
    async (projectId: string): Promise<void> => {
      setBusy(true)
      try {
        await openProject(projectId)
        onOpened?.()
      } catch {
        // 错误已写入全局 error 状态
      } finally {
        setBusy(false)
      }
    },
    [openProject, onOpened]
  )

  const beginRename = (project: DesktopProjectInfo): void => {
    setPendingRemoveId(null)
    setRenameDraft(project.name)
    setRenamingId(project.id)
  }

  const commitRename = useCallback(
    async (projectId: string): Promise<void> => {
      const name = renameDraft.trim()
      setRenamingId(null)
      if (!name) return
      try {
        await renameProject(projectId, name)
      } catch {
        // 错误已写入全局 error 状态
      }
    },
    [renameDraft, renameProject]
  )

  const confirmRemove = useCallback(
    async (projectId: string): Promise<void> => {
      setPendingRemoveId(null)
      try {
        await removeProject(projectId)
      } catch {
        // 错误已写入全局 error 状态
      }
    },
    [removeProject]
  )

  const query = searchQuery.trim().toLowerCase()
  const filteredProjects = projects.filter((project) => {
    if (!query) return true
    return (
      project.name.toLowerCase().includes(query) || project.rootPath.toLowerCase().includes(query)
    )
  })

  return (
    <div className="hub-root projects-root">
      <div className="hub-content-scroll projects-content-scroll">
        <div className="hub-list-container projects-container">
          {error && (
            <div className="hub-mcp-error">
              <CircleAlert size={14} />
              <span>{error}</span>
            </div>
          )}

          {onCreateProject ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: '12px'
              }}
            >
              <button
                type="button"
                className="connector-connect-btn connector-connect-btn--try"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '13px'
                }}
                onClick={() => onCreateProject()}
              >
                <Plus size={14} />
                <span>新建空间</span>
              </button>
            </div>
          ) : null}

          {filteredProjects.length > 0 ? (
            <div className="hub-cards-grid connector-card-grid projects-grid">
              {filteredProjects.map((project) => {
                const isRenaming = renamingId === project.id
                const isConfirmingRemove = pendingRemoveId === project.id

                return (
                  <div
                    key={project.id}
                    className={`hub-card connector-card projects-card${project.isActive ? ' is-active' : ''}`}
                    onClick={() => {
                      if (!project.isActive && !isRenaming && !isConfirmingRemove && !busy) {
                        void handleOpen(project.id)
                      }
                    }}
                  >
                    {/* 左侧头像：圆形渐变 + 白色 Folder 图标 */}
                    <div
                      className="connector-card-icon projects-card-avatar"
                      style={{
                        background: project.isActive
                          ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                          : 'linear-gradient(135deg, #64748b, #475569)'
                      }}
                    >
                      <Folder size={15} color="#ffffff" />
                    </div>

                    {/* 中间信息行 */}
                    <div className="connector-card-main">
                      <div className="connector-card-name-row">
                        <div className="connector-card-name" title={project.name}>
                          {project.name}
                        </div>
                        <span
                          className={`connector-card-status-dot connector-card-status-dot--${project.isActive ? 'connected' : 'disabled'}`}
                          title={project.isActive ? '当前工作区' : '未激活'}
                        />
                        <span className="connector-card-badge">
                          {project.isActive ? '当前工作区' : relativeTime(project.lastOpenedAt)}
                        </span>
                      </div>

                      <div
                        className="connector-card-desc projects-card-path"
                        title={project.rootPath}
                      >
                        {project.rootPath}
                      </div>
                    </div>

                    {/* 右侧操作按钮 */}
                    <div
                      className="connector-card-action"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {isRenaming ? (
                        <div
                          className="projects-inline-editor"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            autoFocus
                            className="projects-inline-input"
                            aria-label={`重命名项目“${project.name}”`}
                            value={renameDraft}
                            onChange={(event) => setRenameDraft(event.currentTarget.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void commitRename(project.id)
                              } else if (event.key === 'Escape') {
                                event.preventDefault()
                                setRenamingId(null)
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="connector-connect-btn"
                            title="保存"
                            disabled={!renameDraft.trim()}
                            onClick={() => void commitRename(project.id)}
                          >
                            <Check size={12} />
                          </button>
                          <button
                            type="button"
                            className="connector-connect-btn"
                            title="取消"
                            onClick={() => setRenamingId(null)}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : isConfirmingRemove ? (
                        <div
                          className="projects-inline-confirm"
                          role="alertdialog"
                          aria-label={`确认移除项目“${project.name}”`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="projects-confirm-hint">移除登记？</span>
                          <button
                            type="button"
                            className="connector-connect-btn is-danger"
                            title="确定移除"
                            onClick={() => void confirmRemove(project.id)}
                          >
                            <Check size={12} />
                          </button>
                          <button
                            type="button"
                            className="connector-connect-btn"
                            title="取消"
                            onClick={() => setPendingRemoveId(null)}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {!project.isActive && (
                            <button
                              type="button"
                              className="connector-connect-btn connector-connect-btn--try"
                              title="打开并切换至此项目"
                              disabled={busy}
                              onClick={() => void handleOpen(project.id)}
                            >
                              <Play size={10} fill="currentColor" />
                            </button>
                          )}
                          <button
                            type="button"
                            className="connector-connect-btn"
                            title="重命名项目"
                            onClick={() => beginRename(project)}
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            type="button"
                            className="connector-connect-btn is-danger"
                            title="移除项目登记"
                            onClick={() => setPendingRemoveId(project.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : query ? (
            <div className="hub-inset-list">
              <div className="hub-empty-list">未搜索到匹配的项目空间</div>
              {onCreateProject ? (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
                  <button
                    type="button"
                    className="connector-connect-btn connector-connect-btn--try"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      fontSize: '13px'
                    }}
                    onClick={() => onCreateProject()}
                  >
                    <Plus size={14} />
                    <span>新建空间</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
