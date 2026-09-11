import type { MastraCodeState } from '@mastra/code-sdk/schema';
import { defineRuntimeModel } from '../models/config.js';

/**
 * Observational Memory（观察记忆）作用域。
 *
 * - `thread`：每个线程维护独立观察日志（默认，稳定）
 * - `resource`：同资源跨线程共享观察日志（实验性）
 */
export type RuntimeOmScope = 'thread' | 'resource'

/**
 * Observer 对多模态附件的处理策略。
 *
 * - `auto`：按 Observer 模型的多模态能力自动决定（默认）
 * - `true` / `false`：强制转发或丢弃附件
 */
export type RuntimeObserveAttachments = 'auto' | boolean

/**
 * Observational Memory 配置。
 *
 * OM 由 Mastra Code SDK 默认启用：Observer 在消息历史超过阈值时压缩出观察日志，
 * Reflector 在观察日志超限时整体重写。此处只暴露 Controller state 已支持的旋钮，
 * 不替换 SDK 默认 Memory 实例。
 *
 * 优先级：显式配置 > 全局 settings.json 播种（`models.om*`）> SDK 默认值。
 * 未指定的字段继续沿用 settings 播种值。
 */
export interface RuntimeObservationalMemoryConfig {
  /** Observer 模型（`provider/model`），负责把原始历史压缩成观察日志 */
  observerModelId?: string

  /** Reflector 模型（`provider/model`），负责重写压缩观察日志 */
  reflectorModelId?: string

  /** 触发观察的消息历史 token 阈值（SDK 默认 30000） */
  observationThreshold?: number

  /** 触发反思的观察日志 token 阈值（SDK 默认 40000） */
  reflectionThreshold?: number

  /** 观察日志使用 caveman 极简压缩风格（SDK 默认 false） */
  cavemanObservations?: boolean

  /** Observer 是否接收图片/文件附件（SDK 默认 'auto'） */
  observeAttachments?: RuntimeObserveAttachments

  /** 记忆作用域（省略时由 SDK 按项目配置自动探测，回退 `thread`） */
  scope?: RuntimeOmScope
}

function validateThreshold(name: string, value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid observational memory ${name} "${value}". Expected a positive integer.`)
  }
  return value
}

/**
 * 将 OM 配置写入 Controller initialState。
 *
 * code-sdk 的合并顺序为 settings 播种 → config.initialState → configDir，
 * 因此这里写入的显式配置优先生效；返回 undefined 表示无需覆盖。
 */
export function applyOmConfigToInitialState(
  initialState: Partial<MastraCodeState> | undefined,
  om: RuntimeObservationalMemoryConfig | undefined,
): Partial<MastraCodeState> | undefined {
  if (!om) return initialState;

  let changed = false;
  const next: Partial<MastraCodeState> = { ...initialState };

  if (om.observerModelId !== undefined) {
    next.observerModelId = defineRuntimeModel(om.observerModelId);
    changed = true;
  }
  if (om.reflectorModelId !== undefined) {
    next.reflectorModelId = defineRuntimeModel(om.reflectorModelId);
    changed = true;
  }
  if (om.observationThreshold !== undefined) {
    next.observationThreshold = validateThreshold('observationThreshold', om.observationThreshold);
    changed = true;
  }
  if (om.reflectionThreshold !== undefined) {
    next.reflectionThreshold = validateThreshold('reflectionThreshold', om.reflectionThreshold);
    changed = true;
  }
  if (om.cavemanObservations !== undefined) {
    next.cavemanObservations = om.cavemanObservations;
    changed = true;
  }
  if (om.observeAttachments !== undefined) {
    next.observeAttachments = om.observeAttachments;
    changed = true;
  }
  if (om.scope !== undefined) {
    next.omScope = om.scope;
    changed = true;
  }

  return changed ? next : initialState;
}
