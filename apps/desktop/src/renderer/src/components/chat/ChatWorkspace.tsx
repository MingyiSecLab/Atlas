import { ChevronDown } from 'lucide-react'
import type { RuntimeSkillInfo } from '@mingyi/runtime'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspace } from '../../state/WorkspaceProvider'
import { Composer } from './Composer'
import { AccessRequestCard } from './AccessRequestCard'
import { PentestCreateCard } from './PentestCreateCard'
import { AssistantMessage, ErrorMessage, UserMessage } from './MessageView'
import type { RuntimePentestCreationIntent } from '@mingyi/runtime'
import type { ExpertItem } from '../hub/hub-types'
import { MessageQueue, type QueuedItem } from './MessageQueue'
import { messageSkill, messageText, type ChatImageAttachment, type ChatTimelineItem } from './types'

interface ChatWorkspaceProps {
  taskId: string
  taskTitle?: string
  isSidebarCollapsed?: boolean
  onNewTask: (projectId?: string) => void
}

function isExplicitPentestCreationIntent(text: string): boolean {
  return /(?:创建|新建|启动|开始).{0,12}(?:渗透|安全).{0,12}(?:评估|测试)|(?:渗透|安全)(?:评估|测试).{0,12}(?:任务|项目)/.test(
    text
  )
}

function mergePentestIntent(
  existing: RuntimePentestCreationIntent | null,
  next: RuntimePentestCreationIntent
): RuntimePentestCreationIntent {
  if (!existing) return next
  return {
    wantsEngagement: next.wantsEngagement || existing.wantsEngagement,
    title: next.title || existing.title,
    origin: next.origin || existing.origin,
    goal: next.goal || existing.goal,
    scope: next.scope?.length ? next.scope : existing.scope,
    principal: next.principal || existing.principal,
    authorizationRef: next.authorizationRef || existing.authorizationRef
  }
}

function getMinimapItemPreview(item: ChatTimelineItem): { title: string; text: string } {
  if (item.role === 'error') {
    return { title: '错误', text: item.content || '发生错误' }
  }
  const roleTitle = item.role === 'user' ? '用户' : item.modelName || '助手'
  const text = messageText(item).trim()
  if (text) {
    return { title: roleTitle, text: text.length > 180 ? `${text.slice(0, 180)}…` : text }
  }
  const skill = messageSkill(item)
  if (skill) {
    return {
      title: roleTitle,
      text: `技能: /${skill.name}${skill.arguments ? ` ${skill.arguments}` : ''}`
    }
  }
  const toolBlock = item.blocks?.find((b) => b?.type === 'tool')
  if (toolBlock && 'name' in toolBlock) {
    return { title: roleTitle, text: `工具调用: ${toolBlock.name}` }
  }
  const reasoningBlock = item.blocks?.find((b) => b?.type === 'reasoning')
  if (reasoningBlock && 'text' in reasoningBlock && reasoningBlock.text) {
    return {
      title: roleTitle,
      text: `思考: ${reasoningBlock.text.slice(0, 120)}…`
    }
  }
  if (item.attachments?.length) {
    return { title: roleTitle, text: `[包含 ${item.attachments.length} 个附件]` }
  }
  return { title: roleTitle, text: '无文本内容' }
}

function ConversationMinimap({
  items,
  visible
}: {
  items: ChatTimelineItem[]
  visible: boolean
}): React.ReactNode {
  if (!visible) return null
  return (
    <nav className="chat-minimap" aria-label="对话导航">
      {items.map((item) => {
        const preview = getMinimapItemPreview(item)
        const label = `${preview.title}: ${preview.text}`
        return (
          <div key={item.id} className="chat-minimap-item">
            <button
              className="chat-minimap-mark"
              data-role={item.role}
              type="button"
              title={label}
              aria-label={label}
              onClick={() => {
                document.getElementById(`message-${item.id}`)?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center'
                })
              }}
            />
            <div className="chat-minimap-popover" role="tooltip">
              <div className="chat-minimap-popover-header">
                <span className="chat-minimap-popover-role">{preview.title}</span>
                {item.role !== 'error' && item.timestamp ? (
                  <span className="chat-minimap-popover-time">{item.timestamp}</span>
                ) : null}
              </div>
              <div className="chat-minimap-popover-content">{preview.text}</div>
            </div>
          </div>
        )
      })}
    </nav>
  )
}

export function ChatWorkspace({
  taskId,
  isSidebarCollapsed = false
}: ChatWorkspaceProps): React.ReactNode {
  const {
    snapshots,
    modelIds,
    modes,
    loadSession,
    updateSession,
    sendMessage: appendMessage,
    invokeSkill,
    respondToAccessRequest,
    abortSession
  } = useWorkspace()
  const snapshot = snapshots[taskId]
  const timeline = useMemo(() => snapshot?.timeline ?? [], [snapshot])
  const [input, setInput] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<RuntimeSkillInfo | undefined>()
  const [pentestIntent, setPentestIntent] = useState<RuntimePentestCreationIntent | null>(null)
  const [pentestIntentBusy, setPentestIntentBusy] = useState(false)
  const [pentestIntentError, setPentestIntentError] = useState<string | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const workspaceRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerHeightRef = useRef(112)
  const composerResizeFrameRef = useRef<number | null>(null)
  const shouldFollowRef = useRef(true)

  const model = snapshot?.modelId ?? '未选择模型'
  const permission = snapshot?.permissionProfileId ?? 'Pentest'
  const modeOptions = useMemo(() => modes.map((m) => m.name), [modes])
  const isStreaming = snapshot?.isRunning ?? false
  const accessRequests = snapshot?.accessRequests ?? []
  const activeAccessRequest = accessRequests[0]

  useEffect(() => {
    if (!snapshot || !snapshot.loaded) void loadSession(taskId)
  }, [loadSession, snapshot, taskId])

  const scrollConversationToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior })
  }, [])

  useEffect(() => {
    if (!shouldFollowRef.current) return
    window.requestAnimationFrame(() => scrollConversationToBottom())
  }, [scrollConversationToBottom, timeline])

  const updateDistanceFromBottom = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    shouldFollowRef.current = distance < 100
    setShowScrollButton(distance >= 140)
  }, [])

  const updateComposerHeight = useCallback(
    (height: number) => {
      if (height === composerHeightRef.current) return
      composerHeightRef.current = height
      workspaceRef.current?.style.setProperty('--chat-composer-height', `${height}px`)
      if (!shouldFollowRef.current || composerResizeFrameRef.current !== null) return
      composerResizeFrameRef.current = window.requestAnimationFrame(() => {
        composerResizeFrameRef.current = null
        scrollConversationToBottom()
      })
    },
    [scrollConversationToBottom]
  )

  useEffect(
    () => () => {
      if (composerResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(composerResizeFrameRef.current)
      }
    },
    []
  )

  const [queuedMessages, setQueuedMessages] = useState<QueuedItem[]>([])

  const handleCancelQueued = useCallback((id: string) => {
    setQueuedMessages((current) => current.filter((item) => item.id !== id))
  }, [])

  const handleSteerQueued = useCallback((id: string) => {
    setQueuedMessages((current) => {
      const targetIndex = current.findIndex((item) => item.id === id)
      if (targetIndex <= 0) return current
      const target = current[targetIndex]
      const rest = current.filter((_, idx) => idx !== targetIndex)
      return [target, ...rest]
    })
  }, [])

  const handleClearQueued = useCallback(() => {
    setQueuedMessages([])
  }, [])

  const handleEditQueued = useCallback((id: string, text: string) => {
    setQueuedMessages((current) =>
      current.map((item) => (item.id === id ? { ...item, text } : item))
    )
  }, [])

  const executeMessage = useCallback(
    async (payload: {
      text: string
      attachments?: ChatImageAttachment[]
      goalMode?: boolean
      expert?: ExpertItem
      skill?: RuntimeSkillInfo
    }): Promise<void> => {
      const { text, attachments = [], goalMode, expert, skill } = payload
      const command = /^\/skill\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(text)
      const skillName = skill?.name ?? command?.[1]
      const skillArguments = skill ? text : (command?.[2]?.trim() ?? '')
      if (!skillName && !text && attachments.length === 0) return
      shouldFollowRef.current = true

      if (skillName) {
        await invokeSkill({
          sessionId: taskId,
          skillName,
          arguments: skillArguments,
          attachments
        })
      } else {
        await appendMessage({
          sessionId: taskId,
          text,
          attachments,
          goalMode,
          expertPrompt: expert?.systemPrompt,
          expertName: expert?.name
        })
        if (attachments.length === 0 && (pentestIntent || isExplicitPentestCreationIntent(text))) {
          setPentestIntentBusy(true)
          setPentestIntentError(null)
          try {
            const intent = await window.api.pentest.parseIntent(text, pentestIntent ?? undefined)
            if (intent.wantsEngagement) {
              setPentestIntent((current) => mergePentestIntent(current, intent))
            }
          } catch (cause) {
            setPentestIntentError(cause instanceof Error ? cause.message : String(cause))
          } finally {
            setPentestIntentBusy(false)
          }
        }
      }
    },
    [appendMessage, invokeSkill, pentestIntent, taskId]
  )

  const sendMessage = useCallback(
    async (
      attachments: ChatImageAttachment[],
      options?: { goalMode?: boolean; expert?: ExpertItem }
    ): Promise<void> => {
      const text = input.trim()
      if (!selectedSkill && !text && attachments.length === 0) return

      // 若当前正在生成流中，则自动放入待执行队列
      if (isStreaming) {
        const queuedItem = {
          id: crypto.randomUUID(),
          text,
          attachments,
          goalMode: options?.goalMode,
          expert: options?.expert,
          skill: selectedSkill
        }
        setQueuedMessages((current) => [...current, queuedItem])
        setInput('')
        setSelectedSkill(undefined)
        return
      }

      setInput('')
      setSelectedSkill(undefined)
      try {
        await executeMessage({
          text,
          attachments,
          goalMode: options?.goalMode,
          expert: options?.expert,
          skill: selectedSkill
        })
      } catch {
        setInput(text)
        if (selectedSkill) setSelectedSkill(selectedSkill)
      }
    },
    [executeMessage, input, isStreaming, selectedSkill]
  )

  const wasStreamingRef = useRef(isStreaming)
  // 监听流式结束，若有排队消息则自动出队执行
  useEffect(() => {
    const prev = wasStreamingRef.current
    wasStreamingRef.current = isStreaming
    if (prev && !isStreaming) {
      setQueuedMessages((current) => {
        if (current.length === 0) return current
        const [nextMessage, ...rest] = current
        window.requestAnimationFrame(() => {
          void executeMessage(nextMessage).catch(() => {
            // 忽略排队自动执行非阻塞异常
          })
        })
        return rest
      })
    }
  }, [executeMessage, isStreaming])

  const isPentestMode = permission.toLowerCase() === 'pentest'
  const isAuditMode = permission.toLowerCase() === 'audit'

  return (
    <section
      ref={workspaceRef}
      className={`chat-workspace${isPentestMode ? ' is-pentest-mode' : ''}${isAuditMode ? ' is-audit-mode' : ''}`}
    >
      <ConversationMinimap items={timeline} visible={isSidebarCollapsed} />
      <div ref={scrollRef} className="chat-scroll" onScroll={updateDistanceFromBottom}>
        <div className="chat-timeline" data-markdown-scroll-container>
          {timeline.map((item) => {
            if (!item) return null
            if (item.role === 'error') return <ErrorMessage key={item.id} error={item} />
            if (item.role === 'user') return <UserMessage key={item.id} message={item} />
            return <AssistantMessage key={item.id} message={item} />
          })}
          {isStreaming && (!timeline.length || timeline[timeline.length - 1]?.role === 'user') ? (
            <AssistantMessage
              key="pending-assistant-stream"
              message={{
                id: 'pending-assistant-stream',
                role: 'assistant',
                isStreaming: true,
                blocks: [],
                timestamp: '刚刚',
                modelName: model !== '未选择模型' ? model : undefined
              }}
            />
          ) : null}
          {pentestIntentBusy ? (
            <p className="chat-pentest-intent-loading">正在生成评估草稿…</p>
          ) : null}
          {pentestIntentError ? (
            <p className="chat-pentest-intent-error" role="alert">
              {pentestIntentError}
            </p>
          ) : null}
          {pentestIntent ? (
            <PentestCreateCard
              intent={pentestIntent}
              onDismiss={() => {
                setPentestIntent(null)
                setPentestIntentError(null)
              }}
              onConfirm={async (draft) => {
                await window.api.pentest.create(draft)
                setPentestIntent(null)
                setPentestIntentError(null)
              }}
            />
          ) : null}
          <div className="chat-bottom-anchor" />
        </div>
      </div>
      {showScrollButton && !activeAccessRequest ? (
        <button
          className="chat-scroll-bottom"
          type="button"
          aria-label="滚动到底部"
          title="滚动到底部"
          onClick={() => {
            shouldFollowRef.current = true
            scrollConversationToBottom('smooth')
          }}
        >
          <ChevronDown size={16} />
        </button>
      ) : null}
      {activeAccessRequest ? (
        <div className="chat-approval-dock" data-testid="chat-approval-dock">
          <AccessRequestCard
            key={activeAccessRequest.toolCallId}
            request={activeAccessRequest}
            pendingCount={accessRequests.length}
            onRespond={(approved) =>
              respondToAccessRequest({
                sessionId: taskId,
                toolCallId: activeAccessRequest.toolCallId,
                approved
              })
            }
          />
        </div>
      ) : null}
      <MessageQueue
        isRunning={isStreaming}
        runningText={isStreaming ? 'AI 正在处理当前任务，完成后将自动发送' : undefined}
        queued={queuedMessages}
        onCancelItem={handleCancelQueued}
        onSteerItem={handleSteerQueued}
        onEditItem={handleEditQueued}
        onClearAll={handleClearQueued}
      />
      <Composer
        value={input}
        model={model}
        modelOptions={modelIds}
        permission={permission}
        modeOptions={modeOptions}
        sessionId={taskId}
        selectedSkill={selectedSkill}
        tokenUsage={snapshot?.tokenUsage}
        queuedCount={queuedMessages.length}
        onSkillSelect={setSelectedSkill}
        onSkillClear={() => setSelectedSkill(undefined)}
        isStreaming={isStreaming}
        onChange={setInput}
        onModelChange={(modelId) => {
          void updateSession({ sessionId: taskId, modelId })
        }}
        onPermissionChange={(permissionProfileId) => {
          void updateSession({ sessionId: taskId, permissionProfileId })
        }}
        onHeightChange={updateComposerHeight}
        onSend={(attachments, options) => void sendMessage(attachments, options)}
        onStop={() => void abortSession(taskId)}
      />
    </section>
  )
}
