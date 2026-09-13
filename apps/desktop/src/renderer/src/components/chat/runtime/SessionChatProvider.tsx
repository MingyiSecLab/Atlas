import { AssistantRuntimeProvider, useAui, useAuiState, useLocalRuntime } from '@assistant-ui/react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import type {
  RuntimeAccessRequest,
  RuntimeSessionEvent,
  RuntimeSessionMessage
} from '@mingyi/runtime'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { ToolStatusOverlay } from './converter'
import { createSessionChatAdapter } from './session-adapter'
import { createSessionRunStream } from './session-run-stream'

export interface SessionChatBoot {
  /** 历史消息（不含仍在生成中的 assistant 消息） */
  messages: ThreadMessageLike[]
  isRunning: boolean
  /** 挂载时仍在生成中的 assistant 消息（resume 种子） */
  resumeSeed?: RuntimeSessionMessage[]
  resumeOverlay?: ToolStatusOverlay
  accessRequests: RuntimeAccessRequest[]
}

/**
 * 每个会话一个 assistant-ui LocalRuntime 实例（App 层用 key={taskId} 保证切换时重挂载）。
 * maxSteps: 1 —— adapter 只中继事件，工具调用是展示性的，
 * 且我们不返回 requires-action 状态，runtime 不会重入 adapter（双保险）。
 */
export function SessionChatProvider({
  sessionId,
  boot,
  children
}: {
  sessionId: string
  boot: SessionChatBoot
  children: React.ReactNode
}): React.ReactNode {
  const adapter = useMemo(() => createSessionChatAdapter(sessionId), [sessionId])
  const runtime = useLocalRuntime(adapter, {
    initialMessages: boot.messages,
    maxSteps: 1
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SessionRunAttach sessionId={sessionId} boot={boot} />
      {children}
    </AssistantRuntimeProvider>
  )
}

/**
 * run 附着器：
 * 1. 挂载时会话仍在运行 → resumeRun 接续事件流（带种子内容）
 * 2. 常驻 watcher → 会话期间外部触发的 run（首页先发送后挂载、切回运行中会话）
 *    在 runtime 空闲时自动 resume，消除挂载竞态
 */
function SessionRunAttach({
  sessionId,
  boot
}: {
  sessionId: string
  boot: SessionChatBoot
}): React.ReactNode {
  const aui = useAui()
  const resumingRef = useRef(false)
  const isRunning = useAuiState((s) => s.thread.isRunning)
  const prevRunningRef = useRef(isRunning)

  useEffect(() => {
    const prev = prevRunningRef.current
    prevRunningRef.current = isRunning
    if (prev && !isRunning) resumingRef.current = false
  }, [isRunning])

  const attach = useCallback(
    (seed?: readonly RuntimeSessionMessage[], overlay?: ToolStatusOverlay): void => {
      if (resumingRef.current) return
      resumingRef.current = true
      const messages = aui.thread.getState().messages
      const parentId = messages.length > 0 ? messages[messages.length - 1].id : null
      aui.thread.resumeRun({
        parentId,
        stream: () =>
          createSessionRunStream({
            sessionId,
            ...(seed ? { seed } : {}),
            ...(overlay ? { seedOverlay: overlay } : {})
          }).stream
      })
    },
    [aui, sessionId]
  )

  useEffect(() => {
    if (boot.isRunning) attach(boot.resumeSeed, boot.resumeOverlay)
    // 仅挂载时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const unsubscribe = window.api.sessions.onEvent((event: RuntimeSessionEvent) => {
      if (event.type === 'session_changed') return
      if (event.sessionId !== sessionId) return
      if (event.type === 'error') return
      if (event.type === 'access_request' || event.type === 'access_request_resolved') return
      if (event.type === 'message' && event.message.role === 'user') return

      if (event.type === 'run_state') {
        if (event.isRunning) attach()
        return
      }
      // assistant message 事件：runtime 空闲说明该消息未被当前 run 消费，
      // 以它为种子 resume（事件本身不会再到达流订阅）
      if (!aui.thread.getState().isRunning) attach([event.message])
    })
    return unsubscribe
  }, [aui, attach, sessionId])

  return null
}
