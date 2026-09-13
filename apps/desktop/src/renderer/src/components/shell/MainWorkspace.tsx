import React, { useState, useRef, useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { DesktopWorkspaceInfo } from '../../../../shared/runtime-ipc'
import {
  ArrowUp,
  Folder,
  FolderPlus,
  ChevronDown,
  Plus,
  MessageSquare,
  Check,
  Paperclip,
  Slash,
  AtSign,
  BookOpen,
  UserCheck,
  Target,
  X
} from 'lucide-react'
import { ModelBrandIcon } from '../common/ModelBrandIcon'
import { useWorkspace } from '../../state/WorkspaceProvider'
import type { ChatImageAttachment, ImageMimeType } from '../chat/types'
import { SkillPicker, type SkillPickerHandle } from '../chat/skills/SkillPicker'
import { ExpertPicker, type ExpertPickerHandle } from '../chat/experts/ExpertPicker'
import type { RuntimeSkillInfo } from '@mingyi/runtime'
import type { ExpertItem } from '../hub/hub-types'

const DEFAULT_AGENT_MODES = ['Pentest', 'Audit']

export type { ChatImageAttachment }

interface MainWorkspaceProps {
  onSendMessage: (
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
  ) => void
  workspace: DesktopWorkspaceInfo | null
  projects?: Array<{ id: string; name: string; rootPath?: string }>
  selectedProjectId?: string | null
  onSelectProject?: (projectId: string | null) => void
  onPickFolder?: () => Promise<string | null>
  runtimeError?: string | null
  modelIds: string[]
  onSelectWorkspace: () => void
}

export const MainWorkspace: React.FC<MainWorkspaceProps> = ({
  onSendMessage,
  projects = [],
  selectedProjectId = null,
  onPickFolder,
  runtimeError,
  modelIds,
  onSelectWorkspace
}) => {
  const { modes } = useWorkspace()
  const availableModes = useMemo(() => {
    if (modes && modes.length > 0) {
      return modes.map((m) => m.name)
    }
    return DEFAULT_AGENT_MODES
  }, [modes])

  const [promptText, setPromptText] = useState('')
  const [selectedModel, setSelectedModel] = useState('自动选择')
  const [selectedMode, setSelectedMode] = useState('Pentest')
  const currentProject = useMemo(() => {
    if (selectedProjectId) {
      return projects.find((p) => p.id === selectedProjectId)
    }
    return undefined
  }, [projects, selectedProjectId])
  const folderDisplayName = currentProject ? currentProject.name : '选择目录'
  const [prevSelectedProjectId, setPrevSelectedProjectId] = useState(selectedProjectId)
  const [isChatOnly, setIsChatOnly] = useState(!selectedProjectId)

  if (selectedProjectId !== prevSelectedProjectId) {
    setPrevSelectedProjectId(selectedProjectId)
    if (selectedProjectId) {
      setIsChatOnly(false)
    }
  }
  const [activeMenu, setActiveMenu] = useState<'add' | 'skills' | 'experts' | null>(null)
  const [skillQuery, setSkillQuery] = useState('')
  const [expertQuery, setExpertQuery] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<RuntimeSkillInfo | undefined>()
  const [selectedExpert, setSelectedExpert] = useState<ExpertItem | undefined>()
  const [goalMode, setGoalMode] = useState(false)
  const [attachments, setAttachments] = useState<ChatImageAttachment[]>([])
  const [openDropdown, setOpenDropdown] = useState<'mode' | 'model' | null>(null)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const skillPickerRef = useRef<SkillPickerHandle>(null)
  const expertPickerRef = useRef<ExpertPickerHandle>(null)

  const models = modelIds.length > 0 ? modelIds : ['自动选择']

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
  }, [promptText])

  // Close dropdowns on outside click
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null)
        setActiveMenu(null)
      }
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpenDropdown(null)
        setActiveMenu(null)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const handleSend = (): void => {
    if (!promptText.trim() && attachments.length === 0 && !selectedSkill && !selectedExpert) return
    onSendMessage(
      promptText,
      selectedModel.includes('/') ? selectedModel : undefined,
      selectedMode,
      {
        attachments: attachments.length > 0 ? attachments : undefined,
        goalMode: goalMode || undefined,
        selectedSkill,
        selectedExpert,
        projectId: isChatOnly ? null : (selectedProjectId ?? null)
      }
    )
    setPromptText('')
    setAttachments([])
    setSelectedSkill(undefined)
    setSelectedExpert(undefined)
    setGoalMode(false)
    setActiveMenu(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (activeMenu === 'experts' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      expertPickerRef.current?.moveSelection(e.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (activeMenu === 'skills' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      skillPickerRef.current?.moveSelection(e.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (activeMenu === 'skills') {
        skillPickerRef.current?.selectActive()
        return
      }
      if (activeMenu === 'experts') {
        expertPickerRef.current?.selectActive()
        return
      }
      handleSend()
    }
  }

  const insertTrigger = (trigger: string): void => {
    setPromptText((prev) => {
      if (!prev) return trigger
      const lastChar = prev.slice(-1)
      return /\s/.test(lastChar) ? `${prev}${trigger}` : `${prev} ${trigger}`
    })
    setActiveMenu(null)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }

  const isImageMimeType = (type: string): type is ImageMimeType => {
    return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(type)
  }

  const handleFiles = (files: File[]): void => {
    for (const file of files) {
      if (!isImageMimeType(file.type)) continue
      if (file.size > 8 * 1024 * 1024) continue
      const id = crypto.randomUUID()
      const mimeType = file.type
      const reader = new FileReader()
      reader.onload = (): void => {
        if (typeof reader.result === 'string') {
          setAttachments((prev) => [
            ...prev,
            {
              id,
              name: file.name,
              mimeType,
              sizeBytes: file.size,
              url: reader.result as string
            }
          ])
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const removeAttachment = (id: string): void => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const handleSelectChat = (): void => {
    setIsChatOnly(true)
  }

  const handleSelectFolder = async (): Promise<void> => {
    if (!currentProject) {
      if (onPickFolder) {
        const id = await onPickFolder()
        if (id) setIsChatOnly(false)
      } else {
        onSelectWorkspace()
        setIsChatOnly(false)
      }
    } else {
      if (isChatOnly) {
        setIsChatOnly(false)
      } else {
        if (onPickFolder) {
          await onPickFolder()
        } else {
          onSelectWorkspace()
        }
      }
    }
  }

  const handleChangeFolder = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (onPickFolder) {
      const id = await onPickFolder()
      if (id) setIsChatOnly(false)
    } else {
      onSelectWorkspace()
      setIsChatOnly(false)
    }
  }

  const hasContent =
    promptText.trim().length > 0 ||
    attachments.length > 0 ||
    Boolean(selectedSkill) ||
    Boolean(selectedExpert)

  return (
    <main className="main-workspace">
      <div className="main-workspace-inner" ref={dropdownRef}>
        {runtimeError ? (
          <div className="runtime-status-banner" role="alert" data-testid="runtime-status-banner">
            {runtimeError}
          </div>
        ) : null}

        <h1 className="main-workspace-heading">今天要整点什么了？</h1>

        <div className={`main-workspace-frame${activeMenu ? ' has-menu-open' : ''}`}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="chat-composer-file-input"
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length > 0) handleFiles(files)
              e.target.value = ''
            }}
          />

          <div
            className="chat-composer-command-region"
            aria-hidden={
              activeMenu !== 'add' && activeMenu !== 'skills' && activeMenu !== 'experts'
            }
            inert={activeMenu !== 'add' && activeMenu !== 'skills' && activeMenu !== 'experts'}
          >
            <AnimatePresence initial={false}>
              {activeMenu === 'add' ? (
                <motion.div
                  key="add-menu"
                  id="main-workspace-add-menu"
                  className="chat-composer-command-panel"
                  role="menu"
                  aria-label="添加到任务"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{
                    height: 'auto',
                    opacity: 1,
                    transition: {
                      height: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
                      opacity: { duration: 0.16, ease: 'easeOut' }
                    }
                  }}
                  exit={{
                    height: 0,
                    opacity: 0,
                    transition: {
                      height: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
                      opacity: { duration: 0.12, ease: 'easeIn' }
                    }
                  }}
                >
                  <div className="chat-composer-command-panel-inner">
                    <div className="chat-composer-command-label">
                      <span className="chat-composer-command-label-icon">⌘</span>
                      <span>命令</span>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActiveMenu(null)
                        fileInputRef.current?.click()
                      }}
                    >
                      <Paperclip size={16} />
                      <span className="chat-composer-command-item-main">
                        <strong>图片</strong>
                      </span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => insertTrigger('/')}>
                      <Slash size={16} />
                      <span className="chat-composer-command-item-main">
                        <strong>命令</strong>
                      </span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => insertTrigger('@')}>
                      <AtSign size={16} />
                      <span className="chat-composer-command-item-main">
                        <strong>提及</strong>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setSkillQuery('')
                        setActiveMenu('skills')
                      }}
                    >
                      <BookOpen size={16} />
                      <span className="chat-composer-command-item-main">
                        <strong>Skills</strong>
                        <span className="chat-composer-command-hint">
                          搜索并显式调用工作区 Skill
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setExpertQuery('')
                        setActiveMenu('experts')
                      }}
                    >
                      <UserCheck size={16} />
                      <span className="chat-composer-command-item-main">
                        <strong>专家</strong>
                        <span className="chat-composer-command-hint">
                          选择全栈架构、代码审查、测试QA等专家
                        </span>
                      </span>
                    </button>
                    <button
                      className={goalMode ? 'is-selected' : undefined}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={goalMode}
                      onClick={() => {
                        setGoalMode((current) => !current)
                        setActiveMenu(null)
                        textareaRef.current?.focus()
                      }}
                    >
                      <Target size={16} />
                      <span className="chat-composer-command-item-main">
                        <strong>Goal</strong>
                        <span className="chat-composer-command-hint">持续执行直到目标完成</span>
                      </span>
                      {goalMode ? (
                        <Check className="chat-composer-command-check" size={15} />
                      ) : null}
                    </button>
                  </div>
                </motion.div>
              ) : activeMenu === 'skills' ? (
                <motion.div
                  key="skills-panel"
                  className="chat-composer-skill-panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{
                    height: 'auto',
                    opacity: 1,
                    transition: {
                      height: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
                      opacity: { duration: 0.16, ease: 'easeOut' }
                    }
                  }}
                  exit={{
                    height: 0,
                    opacity: 0,
                    transition: {
                      height: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
                      opacity: { duration: 0.12, ease: 'easeIn' }
                    }
                  }}
                >
                  <div className="chat-composer-skill-panel-inner">
                    <SkillPicker
                      ref={skillPickerRef}
                      sessionId=""
                      query={skillQuery}
                      showSearchInput={true}
                      onQueryChange={setSkillQuery}
                      onSelect={(skill) => {
                        setSelectedSkill(skill)
                        setActiveMenu(null)
                        window.requestAnimationFrame(() => textareaRef.current?.focus())
                      }}
                    />
                  </div>
                </motion.div>
              ) : activeMenu === 'experts' ? (
                <motion.div
                  key="experts-panel"
                  className="chat-composer-skill-panel chat-composer-expert-panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{
                    height: 'auto',
                    opacity: 1,
                    transition: {
                      height: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
                      opacity: { duration: 0.16, ease: 'easeOut' }
                    }
                  }}
                  exit={{
                    height: 0,
                    opacity: 0,
                    transition: {
                      height: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
                      opacity: { duration: 0.12, ease: 'easeIn' }
                    }
                  }}
                >
                  <div className="chat-composer-skill-panel-inner">
                    <ExpertPicker
                      ref={expertPickerRef}
                      query={expertQuery}
                      showSearchInput={true}
                      onQueryChange={setExpertQuery}
                      onSelect={(expert) => {
                        setSelectedExpert(expert)
                        setActiveMenu(null)
                        window.requestAnimationFrame(() => textareaRef.current?.focus())
                      }}
                    />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="main-workspace-card">
            {selectedSkill ? (
              <div className="chat-composer-selected-skill" role="group" aria-label="已选择 Skill">
                <BookOpen size={14} />
                <span>{selectedSkill.name}</span>
                <button
                  type="button"
                  aria-label={`移除 Skill ${selectedSkill.name}`}
                  onClick={() => setSelectedSkill(undefined)}
                >
                  <X size={12} />
                </button>
              </div>
            ) : null}
            {selectedExpert ? (
              <div
                className="chat-composer-selected-skill chat-composer-selected-expert"
                role="group"
                aria-label="已选择专家"
              >
                <UserCheck size={14} />
                <span>{selectedExpert.name}</span>
                <small style={{ opacity: 0.7, marginLeft: 6 }}>{selectedExpert.title}</small>
                <button
                  type="button"
                  aria-label={`移除专家 ${selectedExpert.name}`}
                  onClick={() => setSelectedExpert(undefined)}
                >
                  <X size={12} />
                </button>
              </div>
            ) : null}
            {attachments.length > 0 && (
              <div
                className="chat-composer-attachments-region"
                style={{ padding: '10px 16px 0 16px' }}
              >
                <div className="chat-composer-attachments" aria-label="已添加图片">
                  <AnimatePresence initial={false}>
                    {attachments.map((attachment) => (
                      <motion.div
                        className="chat-composer-attachment is-ready"
                        key={attachment.id}
                        title={attachment.name}
                        layout
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                      >
                        <img src={attachment.url} alt={attachment.name} />
                        <button
                          type="button"
                          aria-label={`移除图片 ${attachment.name}`}
                          title="移除图片"
                          onClick={() => removeAttachment(attachment.id)}
                        >
                          <X size={12} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

            <div className="main-workspace-textarea-wrapper">
              <textarea
                ref={textareaRef}
                className="main-workspace-textarea"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="描述想让 Agent 做什么，或用 @ 引用文件 / 终端输出..."
                rows={3}
              />
            </div>

            <div className="main-workspace-footer">
              <div className="main-workspace-tools-left">
                <button
                  type="button"
                  className={`main-workspace-chip main-workspace-chip-icon-only${activeMenu === 'add' ? ' is-active' : ''}`}
                  title={activeMenu === 'add' ? '关闭快捷菜单' : '添加图片、Skill、专家或模式 (+)'}
                  aria-expanded={activeMenu === 'add'}
                  onClick={() => setActiveMenu((prev) => (prev === 'add' ? null : 'add'))}
                >
                  <Plus size={15} />
                </button>

                {goalMode && (
                  <button
                    type="button"
                    className="main-workspace-chip"
                    style={{
                      background: 'rgba(234, 88, 12, 0.1)',
                      color: '#c2410c'
                    }}
                    title="Goal 模式已开启（持续执行直到目标完成）"
                    onClick={() => setGoalMode(false)}
                  >
                    <Target size={13} />
                    <span>Goal</span>
                    <X size={11} style={{ marginLeft: 2 }} />
                  </button>
                )}

                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="main-workspace-chip"
                    onClick={() => setOpenDropdown(openDropdown === 'mode' ? null : 'mode')}
                    title="选择模式"
                  >
                    <span>{selectedMode}</span>
                    <ChevronDown size={11} color="#71717a" />
                  </button>

                  {openDropdown === 'mode' && (
                    <div
                      className="main-workspace-dropdown"
                      style={{ left: 0, bottom: 'calc(100% + 6px)', minWidth: 140 }}
                    >
                      {availableModes.map((modeName) => {
                        const isSelected = selectedMode === modeName
                        return (
                          <button
                            key={modeName}
                            type="button"
                            className={`main-workspace-dropdown-item${isSelected ? ' is-selected' : ''}`}
                            onClick={() => {
                              setSelectedMode(modeName)
                              setOpenDropdown(null)
                            }}
                          >
                            <span>{modeName}</span>
                            {isSelected && <Check size={12} style={{ marginLeft: 'auto' }} />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="main-workspace-tools-right">
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="main-workspace-chip"
                    onClick={() => setOpenDropdown(openDropdown === 'model' ? null : 'model')}
                    title="选择模型"
                  >
                    <ModelBrandIcon model={selectedModel} size={14} />
                    <span>{selectedModel} · 默认</span>
                    <ChevronDown size={11} color="#71717a" />
                  </button>

                  {openDropdown === 'model' && (
                    <div
                      className="main-workspace-dropdown"
                      style={{ right: 0, bottom: 'calc(100% + 6px)', minWidth: 200 }}
                    >
                      {models.map((model) => {
                        const isSelected = selectedModel === model
                        return (
                          <button
                            key={model}
                            type="button"
                            className={`main-workspace-dropdown-item${isSelected ? ' is-selected' : ''}`}
                            onClick={() => {
                              setSelectedModel(model)
                              setOpenDropdown(null)
                            }}
                          >
                            <ModelBrandIcon model={model} size={14} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {model}
                            </span>
                            {isSelected && <Check size={12} style={{ marginLeft: 'auto' }} />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className={`main-workspace-send-btn ${hasContent ? 'is-active' : ''}`}
                  disabled={!hasContent}
                  onClick={handleSend}
                  title="发送 (Enter)"
                >
                  <ArrowUp size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="main-workspace-context-bar">
            <div className="main-workspace-context-toggle" role="tablist" aria-label="会话环境">
              <button
                type="button"
                role="tab"
                aria-selected={isChatOnly}
                className={`main-workspace-toggle-btn${isChatOnly ? ' is-active' : ''}`}
                onClick={handleSelectChat}
              >
                <MessageSquare size={13} />
                <span>聊天</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={!isChatOnly}
                className={`main-workspace-toggle-btn${!isChatOnly ? ' is-active' : ''}`}
                onClick={() => void handleSelectFolder()}
                title={
                  currentProject
                    ? `当前空间: ${currentProject.name}${!isChatOnly ? '（点击更换目录）' : '（点击切换）'}`
                    : '选择本机工作区目录作为空间任务'
                }
              >
                <Folder size={13} />
                <span className="main-workspace-toggle-folder-name">{folderDisplayName}</span>
                {currentProject && !isChatOnly && (
                  <span
                    className="main-workspace-toggle-change"
                    onClick={(e) => void handleChangeFolder(e)}
                    title="更换目录"
                  >
                    <FolderPlus size={12} />
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
