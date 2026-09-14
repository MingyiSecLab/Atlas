import { ThreadPrimitive, useAui, useAuiState } from '@assistant-ui/react'
import type { ThreadMessage } from '@assistant-ui/react'
import type {
  RuntimePentestCreationIntent,
  RuntimeSessionEvent,
  RuntimeSessionMessage,
  RuntimeSessionSnapshot,
  RuntimeSkillInfo
} from '@mingyi/runtime'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspace } from '../../state/WorkspaceProvider'
import { Composer } from './Composer'
import { AccessRequestCard } from './AccessRequestCard'
import { PentestCreateCard } from './PentestCreateCard'
import { AssistantMessage, ErrorMessage, UserMessage } from './MessageView'
import type { ExpertItem } from '../hub/hub-types'
import { MessageQueue, type QueuedItem } from './MessageQueue'
import { PromptSuggestions } from './PromptSuggestions'
import { RetryConnectingBar } from './RetryConnectingBar'
import { StoppedRunCard } from './StoppedRunCard'
import { SelectionToolbar } from './SelectionToolbar'
import { ScrollToBottomPill } from './ScrollToBottomPill'
import type { ChatBlock, ChatError, ChatImageAttachment } from './types'
import {
  partsToChatBlocks,
  readAssistantMetadata,
  runtimeMessageToThreadMessageLike
} from './runtime/converter'
import { SessionChatProvider, type SessionChatBoot } from './runtime/SessionChatProvider'

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

interface MinimapItem {
  id: string
  role: 'user' | 'assistant' | 'error'
  timestamp?: string
  blocks: ChatBlock[]
  attachmentCount: number
  modelName?: string
  content?: string
}

function formatTimestamp(value: string | Date): string {
  try {
    const date = typeof value === 'string' ? new Date(value) : value
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return '刚刚'
  }
}

function minimapItemFromMessage(message: ThreadMessage): MinimapItem {
  const metadata = readAssistantMetadata(message)
  return {
    id: metadata.runtimeMessageId ?? message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    timestamp: formatTimestamp(message.createdAt),
    blocks: partsToChatBlocks(message.content),
    attachmentCount: message.content.filter((part) => part.type === 'image').length,
    ...(metadata.modelName ? { modelName: metadata.modelName } : {})
  }
}

function getMinimapItemPreview(item: MinimapItem): { title: string; text: string } {
  if (item.role === 'error') {
    return { title: '错误', text: item.content || '发生错误' }
  }
  const roleTitle = item.role === 'user' ? '用户' : item.modelName || '助手'
  const text = item.blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
  if (text) {
    return { title: roleTitle, text: text.length > 180 ? `${text.slice(0, 180)}…` : text }
  }
  const skill = item.blocks.find(
    (block): block is Extract<ChatBlock, { type: 'skill' }> => block.type === 'skill'
  )
  if (skill) {
    return {
      title: roleTitle,
      text: `技能: /${skill.name}${skill.arguments ? ` ${skill.arguments}` : ''}`
    }
  }
  const toolBlock = item.blocks.find((block) => block?.type === 'tool')
  if (toolBlock && toolBlock.type === 'tool') {
    return { title: roleTitle, text: `工具调用: ${toolBlock.name}` }
  }
  const reasoningBlock = item.blocks.find((block) => block?.type === 'reasoning')
  if (reasoningBlock && reasoningBlock.type === 'reasoning' && reasoningBlock.text) {
    return {
      title: roleTitle,
      text: `思考: ${reasoningBlock.text.slice(0, 120)}…`
    }
  }
  if (item.attachmentCount > 0) {
    return { title: roleTitle, text: `[包含 ${item.attachmentCount} 个附件]` }
  }
  return { title: roleTitle, text: '无文本内容' }
}

function ConversationMinimap({
  items,
  visible
}: {
  items: MinimapItem[]
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

/** sessions.get 快照 → boot（历史 hydrate + 运行中消息的 resume 种子） */
function buildBoot(snapshot: RuntimeSessionSnapshot): SessionChatBoot {
  const overlay = new Map<string, 'waiting_approval' | 'denied'>()
  for (const request of snapshot.accessRequests ?? []) {
    if (request?.toolCallId) overlay.set(request.toolCallId, 'waiting_approval')
  }
  const messages = Array.isArray(snapshot.messages) ? snapshot.messages : []
  let history = messages
  let resumeSeed: RuntimeSessionMessage[] | undefined
  if (snapshot.isRunning) {
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant') {
      history = messages.slice(0, -1)
      resumeSeed = [last]
    }
  }
  return {
    messages: history.map((message) => runtimeMessageToThreadMessageLike(message, overlay)),
    isRunning: snapshot.isRunning,
    ...(resumeSeed ? { resumeSeed, resumeOverlay: overlay } : {}),
    accessRequests: snapshot.accessRequests ?? []
  }
}

export function ChatWorkspace({
  taskId,
  isSidebarCollapsed = false
}: ChatWorkspaceProps): React.ReactNode {
  const [boot, setBoot] = useState<SessionChatBoot | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.sessions
      .get(taskId)
      .then((snapshot) => {
        if (!cancelled) setBoot(buildBoot(snapshot))
      })
      .catch(() => {
        if (!cancelled) setBoot({ messages: [], isRunning: false, accessRequests: [] })
      })
    return () => {
      cancelled = true
    }
  }, [taskId])

  if (!boot) {
    return <section className="chat-workspace" aria-busy="true" />
  }

  return (
    <SessionChatProvider sessionId={taskId} boot={boot} key={taskId}>
      <ChatWorkspaceInner
        key={taskId}
        taskId={taskId}
        isSidebarCollapsed={isSidebarCollapsed}
        initialAccessRequests={boot.accessRequests}
      />
    </SessionChatProvider>
  )
}

function ChatWorkspaceInner({
  taskId,
  isSidebarCollapsed,
  initialAccessRequests
}: {
  taskId: string
  isSidebarCollapsed: boolean
  initialAccessRequests: SessionChatBoot['accessRequests']
}): React.ReactNode {
  const { snapshots, modelIds, modes, updateSession, respondToAccessRequest, abortSession } =
    useWorkspace()
  const snapshot = snapshots[taskId]
  const aui = useAui()
  const messages = useAuiState((s) => s.thread.messages)
  const isRunning = useAuiState((s) => s.thread.isRunning)

  const [input, setInput] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<RuntimeSkillInfo | undefined>()
  const [pentestIntent, setPentestIntent] = useState<RuntimePentestCreationIntent | null>(null)
  const [pentestIntentBusy, setPentestIntentBusy] = useState(false)
  const [pentestIntentError, setPentestIntentError] = useState<string | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [accessRequests, setAccessRequests] = useState(initialAccessRequests)
  const [errorItems, setErrorItems] = useState<ChatError[]>([])
  const [retryStatus, setRetryStatus] = useState<{
    attempt: number
    maxRetries: number
    message?: string
  } | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0)
  const [wasStopped, setWasStopped] = useState(false)
  const workspaceRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerHeightRef = useRef(112)
  const composerResizeFrameRef = useRef<number | null>(null)
  const shouldFollowRef = useRef(true)

  const model = snapshot?.modelId ?? '未选择模型'
  const permission = snapshot?.permissionProfileId ?? 'Pentest'
  const modeOptions = useMemo(() => modes.map((m) => m.name), [modes])
  const isStreaming = isRunning || (snapshot?.isRunning ?? false)
  const activeAccessRequest = accessRequests[0]

  useEffect(() => {
    if (!isStreaming) return undefined
    const start = Date.now()
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => {
      clearInterval(timer)
      setElapsedSeconds(0)
      setRetryStatus(null)
    }
  }, [isStreaming])

  // 审批请求与错误事件由本组件独立订阅（不进入消息流）
  useEffect(() => {
    const unsubscribe = window.api.sessions.onEvent((event: RuntimeSessionEvent) => {
      if (event.type === 'session_changed') return
      if (event.sessionId !== taskId) return
      if (event.type === 'access_request') {
        setAccessRequests((current) => [
          ...current.filter((request) => request.toolCallId !== event.request.toolCallId),
          event.request
        ])
      } else if (event.type === 'access_request_resolved') {
        setAccessRequests((current) =>
          current.filter((request) => request.toolCallId !== event.toolCallId)
        )
      } else if (event.type === 'error') {
        if (event.retryable) {
          // 网络抖动重试中：展示轻量进度条，不塞入聊天流刷屏
          setRetryStatus({
            attempt: event.retryAttempt ?? 1,
            maxRetries: event.maxRetries ?? 10,
            message: event.message
          })
        } else {
          // 最终不可恢复错误：清除重试条，并在聊天流显示最终错误
          setRetryStatus(null)
          if (event.message === 'terminated') {
            setWasStopped(true)
            return
          }
          setErrorItems((current) => [
            ...current.filter((e) => e.content !== event.message),
            { id: `error-${crypto.randomUUID()}`, role: 'error', content: event.message }
          ])
        }
      } else if (event.type === 'message' || (event.type === 'run_state' && !event.isRunning)) {
        // 重连成功产生新消息，或会话结束，清除重试条
        setRetryStatus(null)
      }
    })
    return unsubscribe
  }, [taskId])

  const scrollConversationToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior })
  }, [])

  useEffect(() => {
    if (!shouldFollowRef.current) return
    window.requestAnimationFrame(() => scrollConversationToBottom())
  }, [scrollConversationToBottom, messages, errorItems])

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
    (payload: {
      text: string
      attachments?: ChatImageAttachment[]
      goalMode?: boolean
      expert?: ExpertItem
      skill?: RuntimeSkillInfo
    }): void => {
      const { text, attachments = [], goalMode, expert, skill } = payload
      const command = /^\/skill\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(text)
      const skillName = skill?.name ?? command?.[1]
      const skillArguments = skill ? text : (command?.[2]?.trim() ?? '')
      if (!skillName && !text && attachments.length === 0) return
      setWasStopped(false)
      setErrorItems([])
      shouldFollowRef.current = true

      const imageParts = attachments.map((attachment) => ({
        type: 'image' as const,
        image: attachment.url,
        filename: attachment.name
      }))

      if (skillName) {
        aui.thread.append({
          role: 'user',
          content: [
            ...imageParts,
            {
              type: 'data' as const,
              name: 'skill',
              data: {
                type: 'skill',
                name: skillName,
                ...(skillArguments ? { arguments: skillArguments } : {})
              }
            }
          ],
          metadata: {
            custom: { skillInvocation: { name: skillName, arguments: skillArguments } }
          }
        })
        return
      }

      aui.thread.append({
        role: 'user',
        content: [...imageParts, ...(text ? [{ type: 'text' as const, text }] : [])],
        metadata: {
          custom: {
            ...(goalMode ? { goalMode: true } : {}),
            ...(expert?.systemPrompt ? { expertPrompt: expert.systemPrompt } : {}),
            ...(expert?.name ? { expertName: expert.name } : {})
          }
        }
      })

      if (attachments.length === 0 && (pentestIntent || isExplicitPentestCreationIntent(text))) {
        setPentestIntentBusy(true)
        setPentestIntentError(null)
        void window.api.pentest
          .parseIntent(text, pentestIntent ?? undefined)
          .then((intent) => {
            if (intent.wantsEngagement) {
              setPentestIntent((current) => mergePentestIntent(current, intent))
            }
          })
          .catch((cause: unknown) => {
            setPentestIntentError(cause instanceof Error ? cause.message : String(cause))
          })
          .finally(() => {
            setPentestIntentBusy(false)
          })
      }
    },
    [aui, pentestIntent]
  )

  const handleRetryLast = useCallback(() => {
    setWasStopped(false)
    setErrorItems([])
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUserMessage) {
      aui.thread.append({
        role: 'user',
        content: lastUserMessage.content,
        metadata: lastUserMessage.metadata
      })
    }
  }, [messages, aui])

  const sendMessage = useCallback(
    (
      attachments: ChatImageAttachment[],
      options?: { goalMode?: boolean; expert?: ExpertItem }
    ): void => {
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
      executeMessage({
        text,
        attachments,
        goalMode: options?.goalMode,
        expert: options?.expert,
        skill: selectedSkill
      })
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
          executeMessage(nextMessage)
        })
        return rest
      })
    }
  }, [executeMessage, isStreaming])

  const isPentestMode = permission.toLowerCase() === 'pentest'
  const isAuditMode = permission.toLowerCase() === 'audit'

  const minimapItems = useMemo(() => {
    const items: MinimapItem[] = []
    for (const message of messages) {
      items.push(minimapItemFromMessage(message))
    }
    for (const error of errorItems) {
      items.push({
        id: error.id,
        role: 'error',
        timestamp: '刚刚',
        blocks: [],
        attachmentCount: 0,
        content: error.content
      })
    }
    return items
  }, [messages, errorItems])

  return (
    <ThreadPrimitive.Root asChild>
      <section
        ref={workspaceRef}
        className={`chat-workspace${isPentestMode ? ' is-pentest-mode' : ''}${isAuditMode ? ' is-audit-mode' : ''}`}
      >
        <ConversationMinimap items={minimapItems} visible={isSidebarCollapsed} />
        <div ref={scrollRef} className="chat-scroll" onScroll={updateDistanceFromBottom}>
          <ThreadPrimitive.ViewportProvider>
            <div className="chat-timeline" data-markdown-scroll-container>
              <ThreadPrimitive.Messages>
                {({ message }) =>
                  message.role === 'user' ? (
                    <UserMessage message={message} />
                  ) : (
                    <AssistantMessage message={message} />
                  )
                }
              </ThreadPrimitive.Messages>
              {errorItems.map((error) => (
                <ErrorMessage
                  key={error.id}
                  error={error}
                  onDismiss={() => {
                    setErrorItems((current) => current.filter((e) => e.id !== error.id))
                  }}
                  onRetry={() => {
                    setErrorItems((current) => current.filter((e) => e.id !== error.id))
                    handleRetryLast()
                  }}
                />
              ))}
              {wasStopped ? (
                <StoppedRunCard onDismiss={() => setWasStopped(false)} onRetry={handleRetryLast} />
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
          </ThreadPrimitive.ViewportProvider>
        </div>
        {!activeAccessRequest ? (
          <ScrollToBottomPill
            visible={showScrollButton}
            isStreaming={isStreaming}
            onClick={() => {
              shouldFollowRef.current = true
              scrollConversationToBottom('smooth')
            }}
          />
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
        {retryStatus ? (
          <RetryConnectingBar
            attempt={retryStatus.attempt}
            maxRetries={retryStatus.maxRetries}
            message={retryStatus.message}
            elapsedSeconds={elapsedSeconds}
            onCancel={() => void abortSession(taskId)}
          />
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
        {messages.length === 0 && queuedMessages.length === 0 && !isStreaming ? (
          <PromptSuggestions
            mode={permission}
            disabled={isStreaming}
            onSelect={(prompt) => setInput(prompt)}
          />
        ) : null}
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
          onSend={(attachments, options) => sendMessage(attachments, options)}
          onStop={() => {
            setWasStopped(true)
            void abortSession(taskId)
          }}
        />
        <SelectionToolbar
          onQuote={(text) => {
            const quoteBlock = text
              .split('\n')
              .map((line) => `> ${line}`)
              .join('\n')
            setInput((prev) =>
              prev.trim() ? `${prev.trim()}\n\n${quoteBlock}\n\n` : `${quoteBlock}\n\n`
            )
          }}
          onExplain={(text) => {
            const quoteBlock = text
              .split('\n')
              .map((line) => `> ${line}`)
              .join('\n')
            const prompt = `请详细解释以下内容并梳理核心要点：\n${quoteBlock}\n\n`
            setInput((prev) => (prev.trim() ? `${prev.trim()}\n\n${prompt}` : prompt))
          }}
          onAudit={(text) => {
            const quoteBlock = text
              .split('\n')
              .map((line) => `> ${line}`)
              .join('\n')
            const prompt = `请对以下内容进行安全评估、排查潜在风险与脆弱点：\n${quoteBlock}\n\n`
            setInput((prev) => (prev.trim() ? `${prev.trim()}\n\n${prompt}` : prompt))
          }}
        />
      </section>
    </ThreadPrimitive.Root>
  )
}
