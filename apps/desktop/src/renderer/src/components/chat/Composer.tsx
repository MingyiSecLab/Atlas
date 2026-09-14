import {
  AlertCircle,
  AtSign,
  ArrowUp,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  CornerDownLeft,
  FileImage,
  Paperclip,
  Plus,
  Slash,
  Square,
  Target,
  UserCheck,
  X
} from 'lucide-react'
import type { RuntimeSkillInfo, RuntimeTokenUsage } from '@mingyi/runtime'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'
import type { ChatBlock, ChatImageAttachment, ImageMimeType } from './types'
import { SkillPicker, type SkillPickerHandle } from './skills/SkillPicker'
import { ExpertPicker, type ExpertPickerHandle } from './experts/ExpertPicker'
import type { ExpertItem } from '../hub/hub-types'
import { AttachmentDropzone } from './AttachmentDropzone'
import { ModelPicker } from './ModelPicker'
import { ContextGauge } from './ContextGauge'
import { TodoPanel } from './TodoPanel'

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const AGENT_MODES = ['Pentest', 'Audit']

type ReasoningEffort = 'high' | 'medium' | 'low' | 'off'

const REASONING_LABELS: Record<ReasoningEffort, string> = {
  high: '高',
  medium: '中',
  low: '低',
  off: '关闭'
}
const ACCEPTED_IMAGE_TYPES = new Set<ImageMimeType>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
])
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
const MAX_ATTACHMENTS_TOTAL_BYTES = 12 * 1024 * 1024
const MAX_ATTACHMENTS = 8

function slashSkillQuery(value: string): string | null {
  if (value === '/') return ''
  const match = /^\/skill\/([^\s]*)$/.exec(value)
  return match ? (match[1] ?? '') : null
}

type StagedAttachment = Omit<ChatImageAttachment, 'url' | 'mimeType'> & {
  mimeType: string
  url?: string
  status: 'pending' | 'ready' | 'failed'
  errorMessage?: string
}

function isAcceptedImageType(value: string): value is ImageMimeType {
  return ACCEPTED_IMAGE_TYPES.has(value as ImageMimeType)
}

function isReadyAttachment(attachment: StagedAttachment): attachment is StagedAttachment & {
  mimeType: ImageMimeType
  url: string
  status: 'ready'
} {
  return (
    attachment.status === 'ready' &&
    Boolean(attachment.url) &&
    isAcceptedImageType(attachment.mimeType)
  )
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error ?? new Error('读取文件失败')))
    reader.readAsDataURL(file)
  })
}

function SelectMenu({
  label,
  value,
  displayValue,
  options,
  icon,
  renderOptionIcon,
  open,
  chipClassName,
  menuAlign = 'left',
  optionLabels,
  onOpenChange,
  onChange
}: {
  label: string
  value: string
  displayValue?: string
  options: string[]
  icon?: React.ReactNode
  renderOptionIcon?: (option: string) => React.ReactNode
  open: boolean
  chipClassName?: string
  menuAlign?: 'left' | 'right'
  optionLabels?: Record<string, string>
  reducedMotion?: boolean | null
  onOpenChange: (open: boolean) => void
  onChange: (value: string) => void
}): React.ReactNode {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={cn('chat-composer-chip cursor-pointer', chipClassName)}
          type="button"
          aria-label={label}
          aria-expanded={open}
        >
          {icon}
          <span>{displayValue ?? optionLabels?.[value] ?? value}</span>
          <ChevronDown
            size={11}
            className={cn(
              'chat-composer-chip-chevron transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={menuAlign === 'right' ? 'end' : 'start'}
        side="top"
        sideOffset={6}
        className="chat-composer-menu p-1 z-50 rounded-xl border border-border/70 bg-popover text-popover-foreground shadow-lg min-w-[120px] outline-none"
      >
        <div role="menu" className="flex flex-col gap-0.5">
          {options.map((option) => (
            <button
              className={option === value ? 'is-selected cursor-pointer' : 'cursor-pointer'}
              type="button"
              role="menuitemradio"
              aria-checked={option === value}
              key={option}
              onClick={() => {
                onChange(option)
                onOpenChange(false)
              }}
            >
              {renderOptionIcon ? renderOptionIcon(option) : null}
              <span>{optionLabels?.[option] ?? option}</span>
              {option === value ? <Check size={12} /> : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function Composer({
  value,
  model,
  modelOptions,
  permission,
  modeOptions = AGENT_MODES,
  isStreaming,
  onChange,
  onModelChange,
  onPermissionChange,
  sessionId,
  selectedSkill,
  tokenUsage,
  queuedCount = 0,
  activeBlocks,
  onSkillSelect,
  onSkillClear,
  onHeightChange,
  onSend,
  onStop
}: {
  value: string
  model: string
  modelOptions: string[]
  permission: string
  modeOptions?: string[]
  isStreaming: boolean
  onChange: (value: string) => void
  onModelChange: (value: string) => void
  onPermissionChange: (value: string) => void
  sessionId: string
  selectedSkill?: RuntimeSkillInfo
  tokenUsage?: RuntimeTokenUsage
  queuedCount?: number
  activeBlocks?: readonly ChatBlock[]
  onSkillSelect: (skill: RuntimeSkillInfo) => void
  onSkillClear: () => void
  onHeightChange: (height: number) => void
  onSend: (
    attachments: ChatImageAttachment[],
    options?: { goalMode?: boolean; expert?: ExpertItem }
  ) => void
  onStop: () => void
}): React.ReactNode {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const skillPickerRef = useRef<SkillPickerHandle>(null)
  const expertPickerRef = useRef<ExpertPickerHandle>(null)
  const dragCounterRef = useRef(0)
  const [activeMenu, setActiveMenu] = useState<
    'add' | 'skills' | 'experts' | 'permission' | 'model' | 'reasoning' | null
  >(null)
  const [skillQuery, setSkillQuery] = useState('')
  const [expertQuery, setExpertQuery] = useState('')
  const [selectedExpert, setSelectedExpert] = useState<ExpertItem | undefined>()
  const [attachments, setAttachments] = useState<StagedAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [goalMode, setGoalMode] = useState(false)
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('high')
  const reducedMotion = useReducedMotion()

  const readyAttachments = attachments.filter(isReadyAttachment)
  const canSend =
    Boolean(selectedSkill) ||
    Boolean(selectedExpert) ||
    Boolean(goalMode) ||
    Boolean(value.trim()) ||
    readyAttachments.length > 0
  const inlineSkillQuery = selectedSkill ? null : slashSkillQuery(value)
  const showInlineSkillPicker = activeMenu === null && inlineSkillQuery !== null

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }, [value])

  useEffect(() => {
    const closeFromOutside = (event: PointerEvent): void => {
      if (!composerRef.current?.contains(event.target as Node)) setActiveMenu(null)
    }
    const closeFromKeyboard = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setActiveMenu(null)
    }
    document.addEventListener('pointerdown', closeFromOutside)
    document.addEventListener('keydown', closeFromKeyboard)
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside)
      document.removeEventListener('keydown', closeFromKeyboard)
    }
  }, [])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const reportHeight = (): void => onHeightChange(Math.ceil(wrap.getBoundingClientRect().height))
    const observer = new ResizeObserver(reportHeight)
    observer.observe(wrap)
    reportHeight()
    return () => observer.disconnect()
  }, [onHeightChange])

  function ingestFiles(files: File[]): void {
    if (files.length === 0 || isStreaming) return

    let totalBytes = attachments.reduce(
      (total, attachment) =>
        attachment.status === 'failed' ? total : total + attachment.sizeBytes,
      0
    )
    let attachmentCount = attachments.filter((attachment) => attachment.status !== 'failed').length
    let latestError: string | null = null

    for (const file of files) {
      const id = crypto.randomUUID()
      const baseAttachment = {
        id,
        name: file.name,
        mimeType: file.type,
        sizeBytes: file.size
      }
      if (!isAcceptedImageType(file.type)) {
        latestError = '仅支持 JPEG / PNG / GIF / WEBP 图片'
        setAttachments((current) => [
          ...current,
          { ...baseAttachment, status: 'failed', errorMessage: latestError ?? undefined }
        ])
        continue
      }

      if (attachmentCount >= MAX_ATTACHMENTS) {
        latestError = `每条消息最多添加 ${MAX_ATTACHMENTS} 张图片`
        continue
      }

      if (file.size > MAX_ATTACHMENT_BYTES) {
        latestError = '图片超过 8MB 上限'
        setAttachments((current) => [
          ...current,
          { ...baseAttachment, status: 'failed', errorMessage: latestError ?? undefined }
        ])
        continue
      }

      if (totalBytes + file.size > MAX_ATTACHMENTS_TOTAL_BYTES) {
        latestError = '附件总大小超过 12MB 上限'
        continue
      }

      totalBytes += file.size
      attachmentCount += 1
      const pending: StagedAttachment = { ...baseAttachment, status: 'pending' }
      setAttachments((current) => [...current, pending])

      void readFileAsDataUrl(file)
        .then((url) => {
          setAttachments((current) =>
            current.map((attachment) =>
              attachment.id === id ? { ...attachment, status: 'ready', url } : attachment
            )
          )
        })
        .catch(() => {
          const errorMessage = '读取文件失败'
          setAttachmentError(errorMessage)
          setAttachments((current) =>
            current.map((attachment) =>
              attachment.id === id ? { ...attachment, status: 'failed', errorMessage } : attachment
            )
          )
        })
    }

    setAttachmentError(latestError)
  }

  function submit(): void {
    if (!canSend) return
    const submitted = readyAttachments.map(({ id, name, mimeType, sizeBytes, url }) => ({
      id,
      name,
      mimeType,
      sizeBytes,
      url
    }))
    onSend(submitted, {
      goalMode,
      expert: selectedExpert
    })
    const submittedIds = new Set(submitted.map((attachment) => attachment.id))
    setAttachments((current) => current.filter((attachment) => !submittedIds.has(attachment.id)))
    setAttachmentError(null)
    setActiveMenu(null)
    setSelectedExpert(undefined)
  }

  function insertTrigger(trigger: '/' | '@'): void {
    const textarea = textareaRef.current
    const rawValue = textarea ? textarea.value : value
    const selectionStart = textarea?.selectionStart ?? rawValue.length
    const selectionEnd = textarea?.selectionEnd ?? selectionStart
    const before = rawValue.slice(0, selectionStart)
    const prefix = before.length > 0 && !/\s$/.test(before) ? ' ' : ''
    const inserted = `${prefix}${trigger}`
    const nextValue = before + inserted + rawValue.slice(selectionEnd)
    const nextCaret = selectionStart + inserted.length

    onChange(nextValue)
    setActiveMenu(null)
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
    })
  }

  const isPentestMode = permission.toLowerCase() === 'pentest'
  const isAuditMode = permission.toLowerCase() === 'audit'

  const hasCommandMenuOpen =
    activeMenu === 'add' ||
    activeMenu === 'skills' ||
    activeMenu === 'experts' ||
    showInlineSkillPicker

  return (
    <div
      ref={wrapRef}
      className={`chat-composer-wrap${isPentestMode ? ' is-pentest-mode' : ''}${isAuditMode ? ' is-audit-mode' : ''}`}
    >
      <div
        ref={composerRef}
        className={`chat-composer${isDraggingOver ? ' is-dragging' : ''}${isPentestMode ? ' is-pentest-mode' : ''}${isAuditMode ? ' is-audit-mode' : ''}${hasCommandMenuOpen ? ' has-command-menu-open' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          dragCounterRef.current += 1
          setIsDraggingOver(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault()
          dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
          if (dragCounterRef.current === 0) setIsDraggingOver(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          dragCounterRef.current = 0
          setIsDraggingOver(false)
          ingestFiles(Array.from(event.dataTransfer.files))
        }}
      >
        <input
          ref={fileInputRef}
          className="chat-composer-file-input"
          type="file"
          aria-label="选择图片"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          tabIndex={-1}
          onChange={(event) => {
            ingestFiles(Array.from(event.currentTarget.files ?? []))
            event.currentTarget.value = ''
          }}
        />
        <AttachmentDropzone isActive={isDraggingOver} />
        <div
          className="chat-composer-command-region"
          aria-hidden={
            activeMenu !== 'add' &&
            activeMenu !== 'skills' &&
            activeMenu !== 'experts' &&
            !showInlineSkillPicker
          }
          inert={
            activeMenu !== 'add' &&
            activeMenu !== 'skills' &&
            activeMenu !== 'experts' &&
            !showInlineSkillPicker
          }
        >
          <AnimatePresence initial={false}>
            {activeMenu === 'add' ? (
              <motion.div
                key="add-menu"
                id="chat-composer-add-menu"
                className="chat-composer-command-panel"
                role="menu"
                aria-label="添加到对话"
                initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                animate={{
                  height: 'auto',
                  opacity: 1,
                  transition: reducedMotion
                    ? { duration: 0 }
                    : {
                        height: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
                        opacity: { duration: 0.16, ease: 'easeOut' }
                      }
                }}
                exit={{
                  height: 0,
                  opacity: 0,
                  transition: reducedMotion
                    ? { duration: 0 }
                    : {
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
                      <span className="chat-composer-command-hint">搜索并显式调用工作区 Skill</span>
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
                    {goalMode ? <Check className="chat-composer-command-check" size={15} /> : null}
                  </button>
                </div>
              </motion.div>
            ) : activeMenu === 'skills' || showInlineSkillPicker ? (
              <motion.div
                key="skills-panel"
                className="chat-composer-skill-panel"
                initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                animate={{
                  height: 'auto',
                  opacity: 1,
                  transition: reducedMotion
                    ? { duration: 0 }
                    : {
                        height: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
                        opacity: { duration: 0.16, ease: 'easeOut' }
                      }
                }}
                exit={{
                  height: 0,
                  opacity: 0,
                  transition: reducedMotion
                    ? { duration: 0 }
                    : {
                        height: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
                        opacity: { duration: 0.12, ease: 'easeIn' }
                      }
                }}
              >
                <div className="chat-composer-skill-panel-inner">
                  <SkillPicker
                    ref={skillPickerRef}
                    sessionId={sessionId}
                    query={activeMenu === 'skills' ? skillQuery : (inlineSkillQuery ?? '')}
                    showSearchInput={activeMenu === 'skills'}
                    onQueryChange={setSkillQuery}
                    onSelect={(skill) => {
                      onSkillSelect(skill)
                      if (showInlineSkillPicker) onChange('')
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
                initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                animate={{
                  height: 'auto',
                  opacity: 1,
                  transition: reducedMotion
                    ? { duration: 0 }
                    : {
                        height: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
                        opacity: { duration: 0.16, ease: 'easeOut' }
                      }
                }}
                exit={{
                  height: 0,
                  opacity: 0,
                  transition: reducedMotion
                    ? { duration: 0 }
                    : {
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
        <div className="chat-composer-card">
          {activeBlocks && activeBlocks.length > 0 ? <TodoPanel blocks={activeBlocks} /> : null}
          {selectedSkill ? (
            <div className="chat-composer-selected-skill" role="group" aria-label="已选择 Skill">
              <BookOpen size={14} />
              <span>{selectedSkill.name}</span>
              <button
                type="button"
                aria-label={`移除 Skill ${selectedSkill.name}`}
                onClick={onSkillClear}
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
          {goalMode ? (
            <div
              className="chat-composer-selected-skill chat-composer-selected-goal"
              role="group"
              aria-label="已开启 Goal 模式"
            >
              <Target size={14} />
              <span>Goal 模式</span>
              <button
                type="button"
                aria-label="关闭 Goal 模式"
                title="关闭 Goal 模式"
                onClick={() => setGoalMode(false)}
              >
                <X size={12} />
              </button>
            </div>
          ) : null}
          <AnimatePresence initial={false}>
            {attachments.length > 0 ? (
              <motion.div
                className="chat-composer-attachments-region"
                initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                animate={{
                  height: 'auto',
                  opacity: 1,
                  transition: reducedMotion
                    ? { duration: 0 }
                    : {
                        height: { duration: 0.22, ease: [0.2, 0, 0, 1] },
                        opacity: { duration: 0.18, ease: [0.2, 0, 0, 1] }
                      }
                }}
                exit={{
                  height: 0,
                  opacity: 0,
                  transition: reducedMotion
                    ? { duration: 0 }
                    : {
                        height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
                        opacity: { duration: 0.22, ease: [0.4, 0, 0.2, 1] }
                      }
                }}
              >
                <div className="chat-composer-attachments" aria-label="已添加图片">
                  <AnimatePresence initial={false}>
                    {attachments.map((attachment) => (
                      <motion.div
                        className={`chat-composer-attachment is-${attachment.status}`}
                        key={attachment.id}
                        title={attachment.errorMessage ?? attachment.name}
                        layout
                        initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={
                          reducedMotion
                            ? { duration: 0 }
                            : { duration: 0.16, ease: [0.23, 1, 0.32, 1] }
                        }
                      >
                        {attachment.url ? (
                          <img src={attachment.url} alt={attachment.name} />
                        ) : (
                          <span className="chat-composer-attachment-placeholder">
                            {attachment.status === 'failed' ? (
                              <AlertCircle size={18} />
                            ) : (
                              <FileImage size={18} />
                            )}
                          </span>
                        )}
                        {attachment.sizeBytes ? (
                          <span className="chat-composer-attachment-size">
                            {formatFileSize(attachment.sizeBytes)}
                          </span>
                        ) : null}
                        {attachment.status !== 'ready' ? (
                          <span className="chat-composer-attachment-status">
                            {attachment.status === 'pending' ? '处理中…' : '失败'}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          aria-label={`移除图片 ${attachment.name}`}
                          title="移除图片"
                          onClick={() => {
                            setAttachments((current) =>
                              current.filter((item) => item.id !== attachment.id)
                            )
                            setAttachmentError(null)
                          }}
                        >
                          <X size={12} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          {attachmentError ? (
            <div className="chat-composer-attachment-error" role="alert">
              <AlertCircle size={13} />
              <span>{attachmentError}</span>
            </div>
          ) : null}
          <textarea
            ref={textareaRef}
            value={value}
            rows={1}
            aria-label="发送消息"
            placeholder="提出后续修改要求 / 描述任务，或输入 / 唤出技能..."
            onChange={(event) => onChange(event.currentTarget.value)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files)
              if (files.length > 0) {
                event.preventDefault()
                ingestFiles(files)
              }
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.key === 'Process') return
              if (showInlineSkillPicker && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                event.preventDefault()
                skillPickerRef.current?.moveSelection(event.key === 'ArrowDown' ? 1 : -1)
                return
              }
              if (
                activeMenu === 'experts' &&
                (event.key === 'ArrowDown' || event.key === 'ArrowUp')
              ) {
                event.preventDefault()
                expertPickerRef.current?.moveSelection(event.key === 'ArrowDown' ? 1 : -1)
                return
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                if (showInlineSkillPicker) {
                  skillPickerRef.current?.selectActive()
                  return
                }
                if (activeMenu === 'experts') {
                  expertPickerRef.current?.selectActive()
                  return
                }
                submit()
              }
            }}
          />
          <div className="chat-composer-toolbar">
            <div className="chat-composer-options">
              <button
                className="chat-composer-attach"
                type="button"
                aria-label="添加内容"
                aria-expanded={activeMenu === 'add'}
                aria-controls="chat-composer-add-menu"
                title="添加附件、Skill 或专家"
                onClick={() => setActiveMenu(activeMenu === 'add' ? null : 'add')}
              >
                <Plus size={16} />
              </button>
              <SelectMenu
                label="Agent 模式"
                value={permission}
                options={modeOptions && modeOptions.length > 0 ? modeOptions : AGENT_MODES}
                chipClassName="chat-composer-shield-chip"
                open={activeMenu === 'permission'}
                reducedMotion={reducedMotion}
                onOpenChange={(open) => setActiveMenu(open ? 'permission' : null)}
                onChange={onPermissionChange}
              />
              <AnimatePresence initial={false}>
                {goalMode ? (
                  <motion.span
                    className="chat-composer-mode-control"
                    initial={reducedMotion ? false : { opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -3 }}
                    transition={
                      reducedMotion ? { duration: 0 } : { duration: 0.15, ease: [0.23, 1, 0.32, 1] }
                    }
                  >
                    <span className="chat-composer-mode-divider" aria-hidden="true" />
                    <button
                      className="chat-composer-mode-chip is-goal-active"
                      type="button"
                      aria-label="退出 Goal 模式"
                      aria-pressed="true"
                      title="退出 Goal 模式"
                      onClick={() => setGoalMode(false)}
                    >
                      <Target size={14} />
                      <span>Goal</span>
                      <X size={11} />
                    </button>
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
            <div className="chat-composer-actions">
              {/* ContextGauge 环形容量健康度指示器 */}
              <ContextGauge model={model} tokenUsage={tokenUsage} reducedMotion={reducedMotion} />

              {/* 模型选择器 */}
              <ModelPicker
                model={model}
                modelOptions={modelOptions}
                open={activeMenu === 'model'}
                onOpenChange={(open) => setActiveMenu(open ? 'model' : null)}
                onChange={onModelChange}
                reducedMotion={reducedMotion}
              />

              {/* 思考深度 / 推理级别选择器 🧠 高 ∨ */}
              <Popover
                open={activeMenu === 'reasoning'}
                onOpenChange={(open) => setActiveMenu(open ? 'reasoning' : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    className="chat-composer-chip chat-composer-subtle-chip cursor-pointer"
                    type="button"
                    aria-label="思考深度"
                    aria-expanded={activeMenu === 'reasoning'}
                  >
                    <Brain size={13} />
                    <span>{REASONING_LABELS[reasoningEffort]}</span>
                    <ChevronDown
                      size={11}
                      className={cn(
                        'chat-composer-chip-chevron transition-transform duration-200',
                        activeMenu === 'reasoning' && 'rotate-180'
                      )}
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  side="top"
                  sideOffset={6}
                  className="chat-composer-menu is-right p-1.5 z-50 rounded-xl border border-border/70 bg-popover text-popover-foreground shadow-lg min-w-[140px] outline-none"
                >
                  <div className="chat-composer-menu-header px-2 py-1 text-[11px] font-medium text-muted-foreground">
                    思考深度
                  </div>
                  {(['high', 'medium', 'low', 'off'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      role="menuitemradio"
                      aria-checked={reasoningEffort === level}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-accent hover:text-accent-foreground cursor-pointer',
                        reasoningEffort === level && 'is-selected font-medium'
                      )}
                      onClick={() => {
                        setReasoningEffort(level)
                        setActiveMenu(null)
                      }}
                    >
                      <span className="chat-composer-menu-row flex items-center gap-2">
                        <Brain size={12} />
                        <span>{REASONING_LABELS[level]}</span>
                      </span>
                      {reasoningEffort === level ? (
                        <Check size={12} className="text-primary" />
                      ) : null}
                    </button>
                  ))}
                  <div className="chat-composer-menu-divider my-1 h-px bg-border/50" />
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={goalMode}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-accent hover:text-accent-foreground cursor-pointer',
                      goalMode && 'is-selected font-medium'
                    )}
                    onClick={() => {
                      setGoalMode((prev) => !prev)
                      setActiveMenu(null)
                    }}
                  >
                    <span className="chat-composer-menu-row flex items-center gap-2">
                      <Target size={12} />
                      <span>Goal 模式</span>
                    </span>
                    {goalMode ? <Check size={12} className="text-primary" /> : null}
                  </button>
                </PopoverContent>
              </Popover>

              {/* 发送 / 停止 / 排队按钮 */}
              <button
                className={
                  isStreaming
                    ? canSend
                      ? 'chat-send-button is-queueing'
                      : 'chat-send-button is-stopping'
                    : 'chat-send-button'
                }
                type="button"
                aria-label={isStreaming ? (canSend ? '加入排队' : '停止生成') : '发送'}
                title={
                  isStreaming
                    ? canSend
                      ? '加入执行排队'
                      : '停止生成'
                    : queuedCount > 0
                      ? `发送 (已有 ${queuedCount} 条排队)`
                      : '发送'
                }
                disabled={!isStreaming && !canSend}
                onClick={isStreaming && !canSend ? onStop : submit}
              >
                <span className="chat-send-icon" aria-hidden="true">
                  <AnimatePresence initial={false} mode="wait">
                    <motion.span
                      key={isStreaming ? (canSend ? 'queue' : 'stop') : 'send'}
                      initial={reducedMotion ? false : { opacity: 0, rotate: -12, scale: 0.76 }}
                      animate={{ opacity: 1, rotate: 0, scale: 1 }}
                      exit={{ opacity: 0, rotate: 10, scale: 0.76 }}
                      transition={
                        reducedMotion
                          ? { duration: 0 }
                          : { duration: 0.12, ease: [0.23, 1, 0.32, 1] }
                      }
                    >
                      {isStreaming ? (
                        canSend ? (
                          <CornerDownLeft size={14} />
                        ) : (
                          <Square size={12} fill="currentColor" />
                        )
                      ) : (
                        <ArrowUp size={16} />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <p className="chat-composer-hint">AI 生成内容可能有误，请检查重要信息。</p>
    </div>
  )
}
