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
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-foreground/85 transition-colors hover:bg-muted active:scale-95 cursor-pointer select-none',
            open && 'bg-muted ring-1 ring-primary/30',
            chipClassName
          )}
          type="button"
          aria-label={label}
          aria-expanded={open}
        >
          {icon}
          <span>{displayValue ?? optionLabels?.[value] ?? value}</span>
          <ChevronDown
            size={11}
            className={cn(
              'text-muted-foreground transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={menuAlign === 'right' ? 'end' : 'start'}
        side="top"
        sideOffset={6}
        className="w-40 rounded-xl border border-border/80 bg-popover p-1 text-popover-foreground shadow-xl backdrop-blur-md z-50 outline-none select-none"
      >
        <div role="menu" className="flex flex-col gap-0.5">
          {options.map((option) => (
            <button
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors cursor-pointer',
                option === value && 'bg-accent font-medium text-accent-foreground'
              )}
              type="button"
              role="menuitemradio"
              aria-checked={option === value}
              key={option}
              onClick={() => {
                onChange(option)
                onOpenChange(false)
              }}
            >
              <div className="flex items-center gap-2">
                {renderOptionIcon ? renderOptionIcon(option) : null}
                <span>{optionLabels?.[option] ?? option}</span>
              </div>
              {option === value ? <Check size={12} className="text-primary" /> : null}
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

  return (
    <div
      ref={wrapRef}
      className={cn(
        'chat-composer-wrap relative mx-auto w-full max-w-3xl px-4 pt-1 pb-4 shrink-0 select-none',
        isPentestMode && 'is-pentest-mode',
        isAuditMode && 'is-audit-mode'
      )}
    >
      <div
        ref={composerRef}
        className={cn(
          'chat-composer group relative flex flex-col rounded-[24px] border border-border/70 bg-card/95 shadow-[0_2px_8px_rgba(0,0,0,0.04),0_12px_28px_-10px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-md transition-all duration-200 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 select-text',
          isDraggingOver && 'ring-2 ring-primary border-primary',
          isPentestMode && 'border-amber-500/40 dark:border-amber-500/30',
          isAuditMode && 'border-blue-500/40 dark:border-blue-500/30'
        )}
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
          className="hidden"
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
          className="relative"
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
                className="overflow-hidden rounded-xl border border-border/80 bg-popover/95 shadow-xl backdrop-blur-md m-2 p-1.5 select-none"
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
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    <span>⌘ 命令与工具</span>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                    onClick={() => {
                      setActiveMenu(null)
                      fileInputRef.current?.click()
                    }}
                  >
                    <Paperclip size={14} className="text-muted-foreground" />
                    <span className="font-medium">添加图片附件</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                    onClick={() => insertTrigger('/')}
                  >
                    <Slash size={14} className="text-muted-foreground" />
                    <span className="font-medium">调用命令 /</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                    onClick={() => insertTrigger('@')}
                  >
                    <AtSign size={14} className="text-muted-foreground" />
                    <span className="font-medium">提及专家 @</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                    onClick={() => {
                      setSkillQuery('')
                      setActiveMenu('skills')
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <BookOpen size={14} className="text-muted-foreground" />
                      <div className="flex flex-col text-left">
                        <strong className="font-medium">Skills</strong>
                        <span className="text-[10px] text-muted-foreground">
                          搜索并显式调用工作区 Skill
                        </span>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                    onClick={() => {
                      setExpertQuery('')
                      setActiveMenu('experts')
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <UserCheck size={14} className="text-muted-foreground" />
                      <div className="flex flex-col text-left">
                        <strong className="font-medium">专家角色</strong>
                        <span className="text-[10px] text-muted-foreground">
                          架构、代码审查、安全等专家
                        </span>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={goalMode}
                    className={cn(
                      'flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer',
                      goalMode && 'bg-primary/10 text-primary'
                    )}
                    onClick={() => {
                      setGoalMode((current) => !current)
                      setActiveMenu(null)
                      textareaRef.current?.focus()
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <Target
                        size={14}
                        className={goalMode ? 'text-primary' : 'text-muted-foreground'}
                      />
                      <div className="flex flex-col text-left">
                        <strong className="font-medium">Goal 模式</strong>
                        <span className="text-[10px] text-muted-foreground">
                          持续自主循环直至完成目标
                        </span>
                      </div>
                    </div>
                    {goalMode ? <Check size={14} className="text-primary" /> : null}
                  </button>
                </div>
              </motion.div>
            ) : activeMenu === 'skills' || showInlineSkillPicker ? (
              <motion.div
                key="skills-panel"
                className="overflow-hidden rounded-xl border border-border/80 bg-popover/95 shadow-xl backdrop-blur-md m-2 p-1.5"
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
                <div className="p-1">
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
                className="overflow-hidden rounded-xl border border-border/80 bg-popover/95 shadow-xl backdrop-blur-md m-2 p-1.5"
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
                <div className="p-1">
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
        <div className="flex flex-col p-3">
          {activeBlocks && activeBlocks.length > 0 ? <TodoPanel blocks={activeBlocks} /> : null}
          {selectedSkill ? (
            <div
              className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-purple-600 dark:text-purple-400 self-start"
              role="group"
              aria-label="已选择 Skill"
            >
              <BookOpen size={13} />
              <span>{selectedSkill.name}</span>
              <button
                type="button"
                className="hover:opacity-70 cursor-pointer"
                aria-label={`移除 Skill ${selectedSkill.name}`}
                onClick={onSkillClear}
              >
                <X size={12} />
              </button>
            </div>
          ) : null}
          {selectedExpert ? (
            <div
              className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 self-start"
              role="group"
              aria-label="已选择专家"
            >
              <UserCheck size={13} />
              <span>{selectedExpert.name}</span>
              <span className="text-[10px] opacity-70">({selectedExpert.title})</span>
              <button
                type="button"
                className="hover:opacity-70 cursor-pointer"
                aria-label={`移除专家 ${selectedExpert.name}`}
                onClick={() => setSelectedExpert(undefined)}
              >
                <X size={12} />
              </button>
            </div>
          ) : null}
          {goalMode ? (
            <div
              className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary self-start"
              role="group"
              aria-label="已开启 Goal 模式"
            >
              <Target size={13} />
              <span>Goal 模式运行中</span>
              <button
                type="button"
                className="hover:opacity-70 cursor-pointer"
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
                className="mb-2"
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
                <div className="flex flex-wrap items-center gap-2" aria-label="已添加图片">
                  <AnimatePresence initial={false}>
                    {attachments.map((attachment) => (
                      <motion.div
                        className="chat-composer-attachment relative flex items-center gap-2 rounded-xl border border-border/70 bg-muted/40 p-1.5 text-xs text-foreground shadow-2xs group"
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
                          <img
                            src={attachment.url}
                            alt={attachment.name}
                            className="size-10 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="size-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                            {attachment.status === 'failed' ? (
                              <AlertCircle size={16} className="text-destructive" />
                            ) : (
                              <FileImage size={16} />
                            )}
                          </div>
                        )}
                        <div className="flex flex-col pr-5">
                          <span className="max-w-[100px] truncate text-[11px] font-medium">
                            {attachment.name}
                          </span>
                          {attachment.sizeBytes ? (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {formatFileSize(attachment.sizeBytes)}
                            </span>
                          ) : null}
                          {attachment.status !== 'ready' ? (
                            <span className="text-[10px] text-amber-500 font-medium">
                              {attachment.status === 'pending' ? '处理中…' : '失败'}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="absolute top-1 right-1 size-5 rounded-full bg-background/80 hover:bg-destructive hover:text-white flex items-center justify-center text-muted-foreground transition-colors cursor-pointer"
                          aria-label={`移除图片 ${attachment.name}`}
                          title="移除图片"
                          onClick={() => {
                            setAttachments((current) =>
                              current.filter((item) => item.id !== attachment.id)
                            )
                            setAttachmentError(null)
                          }}
                        >
                          <X size={10} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          {attachmentError ? (
            <div
              className="mb-2 flex items-center gap-1.5 text-xs text-destructive font-medium"
              role="alert"
            >
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
            className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none min-h-[44px]"
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
          <div className="flex flex-wrap items-center justify-between gap-2 px-1.5 pb-1 pt-1 select-none">
            <div className="flex items-center gap-1.5">
              <button
                className="inline-flex size-7.5 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground active:scale-95 cursor-pointer"
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
                open={activeMenu === 'permission'}
                reducedMotion={reducedMotion}
                onOpenChange={(open) => setActiveMenu(open ? 'permission' : null)}
                onChange={onPermissionChange}
              />
              <AnimatePresence initial={false}>
                {goalMode ? (
                  <motion.span
                    initial={reducedMotion ? false : { opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -3 }}
                    transition={
                      reducedMotion ? { duration: 0 } : { duration: 0.15, ease: [0.23, 1, 0.32, 1] }
                    }
                  >
                    <button
                      className="inline-flex h-7 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                      type="button"
                      aria-label="退出 Goal 模式"
                      aria-pressed="true"
                      title="退出 Goal 模式"
                      onClick={() => setGoalMode(false)}
                    >
                      <Target size={13} />
                      <span>Goal</span>
                      <X size={11} />
                    </button>
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
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

              {/* 思考深度 / 推理级别选择器 */}
              <Popover
                open={activeMenu === 'reasoning'}
                onOpenChange={(open) => setActiveMenu(open ? 'reasoning' : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 hover:bg-muted px-2.5 text-xs font-medium text-foreground/85 transition-colors active:scale-95 cursor-pointer select-none"
                    type="button"
                    aria-label="思考深度"
                    aria-expanded={activeMenu === 'reasoning'}
                  >
                    <Brain size={12} className="text-purple-500 shrink-0" />
                    <span>{REASONING_LABELS[reasoningEffort]}</span>
                    <ChevronDown
                      size={11}
                      className={cn(
                        'text-muted-foreground transition-transform duration-200',
                        activeMenu === 'reasoning' && 'rotate-180'
                      )}
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  side="top"
                  sideOffset={6}
                  className="w-40 rounded-xl border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-xl backdrop-blur-md z-50 outline-none select-none"
                >
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">
                    思考深度
                  </div>
                  {(['high', 'medium', 'low', 'off'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      role="menuitemradio"
                      aria-checked={reasoningEffort === level}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors',
                        reasoningEffort === level && 'bg-accent font-medium text-accent-foreground'
                      )}
                      onClick={() => {
                        setReasoningEffort(level)
                        setActiveMenu(null)
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Brain size={12} className="text-purple-500" />
                        <span>{REASONING_LABELS[level]}</span>
                      </div>
                      {reasoningEffort === level ? (
                        <Check size={12} className="text-primary" />
                      ) : null}
                    </button>
                  ))}
                  <div className="my-1 h-px bg-border/50" />
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={goalMode}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors',
                      goalMode && 'bg-accent font-medium text-accent-foreground'
                    )}
                    onClick={() => {
                      setGoalMode((prev) => !prev)
                      setActiveMenu(null)
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Target size={12} className="text-primary" />
                      <span>Goal 模式</span>
                    </div>
                    {goalMode ? <Check size={12} className="text-primary" /> : null}
                  </button>
                </PopoverContent>
              </Popover>

              {/* 发送 / 停止 / 排队按钮 */}
              <button
                className={cn(
                  'inline-flex size-7.5 items-center justify-center rounded-full shadow-xs transition-all active:scale-95 cursor-pointer',
                  isStreaming
                    ? canSend
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : 'bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30 disabled:pointer-events-none'
                )}
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
                <AnimatePresence initial={false} mode="wait">
                  <motion.span
                    key={isStreaming ? (canSend ? 'queue' : 'stop') : 'send'}
                    initial={reducedMotion ? false : { opacity: 0, rotate: -12, scale: 0.76 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: 10, scale: 0.76 }}
                    transition={
                      reducedMotion ? { duration: 0 } : { duration: 0.12, ease: [0.23, 1, 0.32, 1] }
                    }
                  >
                    {isStreaming ? (
                      canSend ? (
                        <CornerDownLeft size={13} />
                      ) : (
                        <Square size={11} fill="currentColor" />
                      )
                    ) : (
                      <ArrowUp size={15} />
                    )}
                  </motion.span>
                </AnimatePresence>
              </button>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground/55 select-none leading-none">
        AI 生成内容仅供参考，请核对重要评估结论与风险项。
      </p>
    </div>
  )
}
