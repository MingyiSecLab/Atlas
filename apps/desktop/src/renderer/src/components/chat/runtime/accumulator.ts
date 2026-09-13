import type { RuntimeSessionEvent, RuntimeSessionMessage } from '@mingyi/runtime'
import type { ThreadAssistantMessagePart } from '@assistant-ui/react'
import {
  runtimeBlocksToParts,
  type AssistantRunMetadata,
  type ToolStatusOverlay
} from './converter'

export interface AssistantRunAccumulatorOptions {
  /** 重连（resume）场景下已经产生的 assistant 消息 */
  seed?: readonly RuntimeSessionMessage[]
  seedOverlay?: ToolStatusOverlay
}

/**
 * 将一个 run 内的 runtime assistant 消息（按 id 整表替换的累积快照）
 * 合并为单条 assistant-ui 消息：
 * - 保持首见顺序（多消息合并时 part 顺序稳定）
 * - 维护审批事件带来的工具状态 overlay
 * - 派生 metadata（最新消息 id / modelName / messageEnded）
 */
export class AssistantRunAccumulator {
  private readonly messages = new Map<string, RuntimeSessionMessage>()
  private readonly endedIds = new Set<string>()
  private readonly overlay = new Map<string, 'waiting_approval' | 'denied'>()
  private readonly firstSeenAt = new Map<string, number>()
  private readonly elapsed = new Map<string, number>()
  private lastId: string | undefined

  constructor(options: AssistantRunAccumulatorOptions = {}) {
    for (const message of options.seed ?? []) {
      this.messages.set(message.id, message)
      this.lastId = message.id
    }
    if (options.seedOverlay) {
      for (const [toolCallId, status] of options.seedOverlay) {
        this.overlay.set(toolCallId, status)
      }
    }
  }

  applyEvent(event: RuntimeSessionEvent): void {
    if (event.type === 'message' && event.message.role === 'assistant') {
      this.messages.set(event.message.id, event.message)
      this.lastId = event.message.id
      if (event.phase === 'end') this.endedIds.add(event.message.id)
      this.trackToolTiming(event.message)
    } else if (event.type === 'access_request') {
      this.overlay.set(event.request.toolCallId, 'waiting_approval')
    } else if (event.type === 'access_request_resolved') {
      if (event.approved) this.overlay.delete(event.toolCallId)
      else this.overlay.set(event.toolCallId, 'denied')
    }
  }

  /** 记录工具首次出现时间，状态终结时结算耗时 */
  private trackToolTiming(message: RuntimeSessionMessage): void {
    const now = Date.now()
    for (const block of message.blocks ?? []) {
      if (block.type !== 'tool') continue
      if (!this.firstSeenAt.has(block.id)) this.firstSeenAt.set(block.id, now)
      const settled =
        block.status === 'success' || block.status === 'error' || block.status === 'denied'
      if (settled && !this.elapsed.has(block.id)) {
        const started = this.firstSeenAt.get(block.id) ?? now
        this.elapsed.set(block.id, Math.max(0, now - started))
      }
    }
  }

  /** 已结算的工具耗时（毫秒），key 为 toolCallId */
  get timing(): ReadonlyMap<string, number> {
    return this.elapsed
  }

  /** 合并后的全部 part（按消息首见顺序展开，应用状态 overlay 与耗时） */
  get parts(): ThreadAssistantMessagePart[] {
    const parts: ThreadAssistantMessagePart[] = []
    for (const message of this.messages.values()) {
      parts.push(
        ...runtimeBlocksToParts(message.blocks ?? [], 'assistant', this.overlay, this.elapsed)
      )
    }
    return parts
  }

  get sawContent(): boolean {
    return this.messages.size > 0
  }

  get statusOverlay(): ToolStatusOverlay {
    return this.overlay
  }

  /** assistant-ui ChatModelRunResult.metadata（custom 扩展点） */
  get metadata(): { custom: AssistantRunMetadata & Record<string, unknown> } {
    const last = this.lastId ? this.messages.get(this.lastId) : undefined
    return {
      custom: {
        ...(last
          ? {
              runtimeMessageId: last.id,
              ...(last.modelName ? { modelName: last.modelName } : {})
            }
          : {}),
        messageEnded: last ? this.endedIds.has(last.id) : false
      }
    }
  }
}
