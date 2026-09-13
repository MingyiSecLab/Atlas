import type { ChatModelRunResult } from '@assistant-ui/react'
import type { RuntimeSessionEvent, RuntimeSessionMessage } from '@mingyi/runtime'
import { AssistantRunAccumulator } from './accumulator'
import type { ToolStatusOverlay } from './converter'

export interface SessionRunStreamOptions {
  sessionId: string
  /** 重连（resume）场景下已经产生的 assistant 消息 */
  seed?: readonly RuntimeSessionMessage[]
  seedOverlay?: ToolStatusOverlay
  signal?: AbortSignal
}

export interface SessionRunStream {
  /** 订阅 window.api.sessions.onEvent 并产出累积快照；run_state 结束或 abort 时返回 */
  stream: AsyncGenerator<ChatModelRunResult>
  /** 发送侧 IPC 失败时提前终止流（未产出内容时抛出以进入消息 error 态） */
  fail: (error: Error) => void
}

/**
 * 把一个 run 的 RuntimeSessionEvent 事件流转换为 assistant-ui 的
 * ChatModelRunResult 累积快照流。
 *
 * 语义：
 * - 订阅先于发送建立（不丢事件）
 * - 用户 role 的 message 事件跳过（runtime 已 append 乐观用户消息，回显会重复）
 * - 仅在 parts 非空时 yield（空 content 会让 typing indicator 失效）
 * - 审批事件不暂停流（审批 dock 由独立订阅驱动）
 * - run_state isRunning=false 为唯一正常终止点；reason=error 时附 incomplete 状态
 * - error 事件忽略（由独立订阅渲染为 ErrorMessage）
 * - abort 仅退订（后端中止由停止按钮 → sessions.abort 驱动）
 */
export function createSessionRunStream(options: SessionRunStreamOptions): SessionRunStream {
  const { sessionId, signal } = options
  const accumulator = new AssistantRunAccumulator({
    ...(options.seed ? { seed: options.seed } : {}),
    ...(options.seedOverlay ? { seedOverlay: options.seedOverlay } : {})
  })

  const queue: RuntimeSessionEvent[] = []
  let wakeup: (() => void) | undefined
  let terminal: 'complete' | 'aborted' | 'error' | 'suspended' | undefined
  let stopped = false
  let failure: Error | undefined

  const wake = (): void => {
    const resolve = wakeup
    wakeup = undefined
    resolve?.()
  }

  const handleEvent = (event: RuntimeSessionEvent): void => {
    if (stopped) return
    if (event.type === 'session_changed') return
    if (event.sessionId !== sessionId) return
    if (event.type === 'error') return
    if (event.type === 'message' && event.message.role === 'user') return
    queue.push(event)
    wake()
  }

  const unsubscribe = window.api.sessions.onEvent(handleEvent)

  const stream = (async function* (): AsyncGenerator<ChatModelRunResult> {
    const onAbort = (): void => {
      stopped = true
      wake()
    }
    if (signal) {
      if (signal.aborted) {
        unsubscribe()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }

    try {
      while (true) {
        let produced = false
        while (queue.length > 0) {
          const event = queue.shift()
          if (!event) break
          if (event.type === 'run_state' && !event.isRunning) {
            terminal = event.reason ?? 'complete'
          } else {
            accumulator.applyEvent(event)
          }
          produced = true
        }

        if (produced && accumulator.parts.length > 0) {
          yield { content: accumulator.parts, metadata: accumulator.metadata }
        }

        if (terminal !== undefined || stopped) break
        if (failure) break

        await new Promise<void>((resolve) => {
          wakeup = resolve
        })
      }

      if (terminal === 'error') {
        yield {
          content: accumulator.parts,
          metadata: accumulator.metadata,
          status: {
            type: 'incomplete',
            reason: 'error',
            error: '会话运行出错'
          }
        }
      } else if (terminal !== undefined && accumulator.parts.length > 0) {
        yield { content: accumulator.parts, metadata: accumulator.metadata }
      }

      // 发送失败且尚未产出任何内容：抛出让消息进入 error 态；
      // 已产出内容则保留内容静默结束
      if (failure && !accumulator.sawContent) throw failure
    } finally {
      stopped = true
      wakeup = undefined
      signal?.removeEventListener('abort', onAbort)
      unsubscribe()
    }
  })()

  return {
    stream,
    fail: (error: Error): void => {
      if (stopped || terminal !== undefined) return
      failure = error
      stopped = true
      wake()
    }
  }
}
