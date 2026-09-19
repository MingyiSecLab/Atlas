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
import { useStickToBottom } from './use-stick-to-bottom'
import { ConversationMapAui } from '@renderer/components/assistant-ui/elements/conversation-map.aui'
import { DayDivider } from '@renderer/components/assistant-ui/elements/day-separator'
import { isSameDay } from '@renderer/lib/date'
import type { ChatError, ChatImageAttachment } from './types'
import { partsToChatBlocks, runtimeMessageToThreadMessageLike } from './runtime/converter'
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

export function ChatWorkspace({ taskId }: ChatWorkspaceProps): React.ReactNode {
  const [sessionBoot, setSessionBoot] = useState<{ id: string; boot: SessionChatBoot } | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.sessions
      .get(taskId)
      .then((snapshot) => {
        if (!cancelled) setSessionBoot({ id: taskId, boot: buildBoot(snapshot) })
      })
      .catch(() => {
        if (!cancelled)
          setSessionBoot({
            id: taskId,
            boot: { messages: [], isRunning: false, accessRequests: [] }
          })
      })
    return () => {
      cancelled = true
    }
  }, [taskId])

  if (!sessionBoot || sessionBoot.id !== taskId) {
    return <section className="chat-workspace" aria-busy="true" />
  }

  const { boot } = sessionBoot

  return (
    <SessionChatProvider sessionId={taskId} boot={boot} key={taskId}>
      <ChatWorkspaceInner
        key={taskId}
        taskId={taskId}
        initialAccessRequests={boot.accessRequests}
      />
    </SessionChatProvider>
  )
}

function ChatTimelineMessage({ message }: { message: ThreadMessage }): React.ReactNode {
  const isFirstOfDay = useAuiState((s) => {
    const msgs = s.thread.messages
    const idx = msgs.findIndex((m) => m.id === message.id)
    if (idx === 0) return true
    if (idx > 0) {
      const prev = msgs[idx - 1]
      return !isSameDay(prev.createdAt, message.createdAt)
    }
    return false
  })

  return (
    <>
      {isFirstOfDay ? <DayDivider timestamp={message.createdAt} /> : null}
      {message.role === 'user' ? (
        <UserMessage message={message} />
      ) : (
        <AssistantMessage message={message} />
      )}
    </>
  )
}

function ChatWorkspaceInner({
  taskId,
  initialAccessRequests
}: {
  taskId: string
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
  const composerHeightRef = useRef(112)
  const composerResizeFrameRef = useRef<number | null>(null)

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
          setRetryStatus({
            attempt: event.retryAttempt ?? 1,
            maxRetries: event.maxRetries ?? 10,
            message: event.message
          })
        } else {
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
        setRetryStatus(null)
      }
    })
    return unsubscribe
  }, [taskId])

  const { scrollRef, isAtBottom, scrollToBottom } = useStickToBottom({
    threshold: 80,
    autoScroll: isStreaming
  })

  const updateComposerHeight = useCallback(
    (height: number) => {
      if (height === composerHeightRef.current) return
      composerHeightRef.current = height
      workspaceRef.current?.style.setProperty('--chat-composer-height', `${height}px`)
      if (!isAtBottom || composerResizeFrameRef.current !== null) return
      composerResizeFrameRef.current = window.requestAnimationFrame(() => {
        composerResizeFrameRef.current = null
        scrollToBottom('auto')
      })
    },
    [isAtBottom, scrollToBottom]
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
      scrollToBottom('auto')

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
    [aui, pentestIntent, scrollToBottom]
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

  return (
    <ThreadPrimitive.Root asChild>
      <section
        ref={workspaceRef}
        className={`chat-workspace${isPentestMode ? ' is-pentest-mode' : ''}${isAuditMode ? ' is-audit-mode' : ''}`}
      >
        <div ref={scrollRef} className="chat-scroll relative">
          <ThreadPrimitive.ViewportProvider>
            {/* 对话导轨：坐在消息列左侧的空隙里，按轮次索引整段对话。
                空隙不够时由 main.css 的容器查询 `chat-workspace` 自动隐藏。 */}
            <ConversationMapAui side="left" />
            <div className="chat-timeline" data-markdown-scroll-container>
              <ThreadPrimitive.Messages>
                {({ message }) => <ChatTimelineMessage message={message} />}
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
                    // 带上当前会话 ID：右侧渗透面板按会话绑定该任务，避免跨会话串数据。
                    await window.api.pentest.create({ ...draft, taskId })
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
            visible={!isAtBottom}
            isStreaming={isStreaming}
            onClick={() => scrollToBottom('smooth')}
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
          activeBlocks={
            messages.length > 0
              ? partsToChatBlocks(messages[messages.length - 1].content)
              : undefined
          }
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
