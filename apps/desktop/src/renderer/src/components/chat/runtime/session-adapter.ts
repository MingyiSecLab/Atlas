import type { ChatModelAdapter } from '@assistant-ui/react'
import { extractSendPayload } from './converter'
import { createSessionRunStream } from './session-run-stream'

/**
 * 每个挂载的会话一个 adapter 实例：把 aui 的 run 映射为
 * sessions.sendMessage / skills.invoke + 事件流中继。
 *
 * 注意：abortSignal 只用于退订事件流，绝不调用 sessions.abort——
 * aui 在新 run 开始时会 abort 旧 run（测试依赖此行为），
 * 后端中止仅由停止按钮驱动。
 */
export function createSessionChatAdapter(sessionId: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const payload = extractSendPayload(messages)
      if (!payload) return

      const { stream, fail } = createSessionRunStream({ sessionId, signal: abortSignal })

      const send =
        payload.kind === 'skill'
          ? window.api.skills.invoke({
              sessionId,
              name: payload.name,
              arguments: payload.arguments,
              ...(payload.files.length ? { files: payload.files } : {})
            })
          : window.api.sessions.sendMessage({
              sessionId,
              content: payload.text,
              ...(payload.files.length ? { files: payload.files } : {}),
              ...(payload.goalMode ? { goalMode: payload.goalMode } : {}),
              ...(payload.expertPrompt ? { expertPrompt: payload.expertPrompt } : {}),
              ...(payload.expertName ? { expertName: payload.expertName } : {})
            })

      send.catch((cause: unknown) => {
        fail(cause instanceof Error ? cause : new Error(String(cause)))
      })

      yield* stream
    }
  }
}
