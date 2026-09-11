import type { RuntimeObservationalMemoryConfig } from '../mastra/observational-memory.js'

/**
 * Observational Memory 运行时配置快照。
 *
 * 字段语义与 `RuntimeObservationalMemoryConfig` 一致；`omEnabled` 由
 * thresholds/model 是否被覆盖推导，仅供 UI 展示当前覆盖状态。
 */
export interface RuntimeOmStatus {
  /** Observer 模型（`provider/model`） */
  observerModelId: string

  /** Reflector 模型（`provider/model`） */
  reflectorModelId: string

  /** 触发观察的消息历史 token 阈值 */
  observationThreshold: number

  /** 触发反思的观察日志 token 阈值 */
  reflectionThreshold: number

  /** 观察日志是否使用 caveman 极简压缩风格 */
  cavemanObservations: boolean

  /** Observer 是否接收图片/文件附件 */
  observeAttachments: 'auto' | boolean

  /** 记忆作用域 */
  omScope: 'thread' | 'resource'
}

export interface UpdateRuntimeOmInput {
  observerModelId?: string
  reflectorModelId?: string
  observationThreshold?: number
  reflectionThreshold?: number
  cavemanObservations?: boolean
  observeAttachments?: RuntimeObservationalMemoryConfig['observeAttachments']
  scope?: 'thread' | 'resource'
}
