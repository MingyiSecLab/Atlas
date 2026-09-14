import type { AgentController, Session } from '@mastra/core/agent-controller'
import { loadSettings, saveSettings } from '@mastra/code-sdk/onboarding/settings'
import type { MastraCodeState } from '@mastra/code-sdk/schema'
import { defineRuntimeModel } from '../models/config.js'
import type { RuntimeOmStatus, UpdateRuntimeOmInput } from './types.js'

interface RuntimeOmServiceDependencies {
  controller: AgentController<MastraCodeState>
  defaultSession: Session<MastraCodeState>
  /**
   * 将 state 更新广播到 default 会话与全部活跃会话。各 Session 的 state 相互
   * 隔离（创建时从 controller initialState 克隆），只写 defaultSession 的话，
   * 聊天会话读不到更新 —— OM 的 memory 工厂按「当前请求会话」的 state 解析模型。
   */
  broadcastState?: (updates: Partial<MastraCodeState>) => Promise<void>
  /** 提供时把 OM 覆盖持久化到 settings.json，重启后由 SDK 播种进新会话。 */
  settingsPath?: string
}

function positiveInt(name: string, value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name} "${value}". Expected a positive integer.`)
  }
  return value
}

/**
 * Observational Memory 运行时服务。
 *
 * OM 旋钮是 Controller state 字段（observerModelId 等），SDK 的默认记忆工厂
 * 每次构建 Memory 时从 requestContext 读取它们，因此写入后对后续请求生效，
 * 无需重启会话。读取走 session.state.get()（live 快照）。
 */
export function createRuntimeOmService({
  controller,
  defaultSession,
  broadcastState,
  settingsPath
}: RuntimeOmServiceDependencies) {
  const state = (): Readonly<MastraCodeState> => defaultSession.state.get()

  /** 模型/阈值等覆盖写入 settings.json（字段名与 SDK 启动播种读取的一致）。 */
  const persistOverrides = (updates: Partial<MastraCodeState>): void => {
    if (!settingsPath) return
    const settings = loadSettings(settingsPath)
    const models = { ...settings.models }
    if (updates.observerModelId !== undefined) {
      models.observerModelOverride = updates.observerModelId
    }
    if (updates.reflectorModelId !== undefined) {
      models.reflectorModelOverride = updates.reflectorModelId
    }
    if (updates.observationThreshold !== undefined) {
      models.omObservationThreshold = updates.observationThreshold
    }
    if (updates.reflectionThreshold !== undefined) {
      models.omReflectionThreshold = updates.reflectionThreshold
    }
    if (updates.cavemanObservations !== undefined) {
      models.omCavemanObservations = updates.cavemanObservations
    }
    if (updates.observeAttachments !== undefined) {
      models.omObserveAttachments = updates.observeAttachments
    }
    saveSettings({ ...settings, models }, settingsPath)
  }

  return {
    /** 读取当前 OM 配置（Controller state 快照，未显式注入时回退 settings.json 持久化值）。 */
    getStatus: (): RuntimeOmStatus => {
      const snapshot = state()
      let observerModelId: string | undefined = snapshot.observerModelId
      let reflectorModelId: string | undefined = snapshot.reflectorModelId
      let observationThreshold: number | undefined = snapshot.observationThreshold
      let reflectionThreshold: number | undefined = snapshot.reflectionThreshold
      let cavemanObservations: boolean | undefined = snapshot.cavemanObservations
      let observeAttachments: 'auto' | boolean | undefined = snapshot.observeAttachments

      if (settingsPath) {
        try {
          const settings = loadSettings(settingsPath)
          if (settings.models) {
            observerModelId = observerModelId || settings.models.observerModelOverride || undefined
            reflectorModelId = reflectorModelId || settings.models.reflectorModelOverride || undefined
            if (observationThreshold === undefined && settings.models.omObservationThreshold) {
              observationThreshold = settings.models.omObservationThreshold
            }
            if (reflectionThreshold === undefined && settings.models.omReflectionThreshold) {
              reflectionThreshold = settings.models.omReflectionThreshold
            }
            if (cavemanObservations === undefined && settings.models.omCavemanObservations !== null) {
              cavemanObservations = settings.models.omCavemanObservations
            }
            if (observeAttachments === undefined && settings.models.omObserveAttachments !== null) {
              observeAttachments = settings.models.omObserveAttachments
            }
          }
        } catch {}
      }

      return {
        observerModelId: observerModelId || 'google/gemini-3.5-flash',
        reflectorModelId: reflectorModelId || observerModelId || 'google/gemini-3.5-flash',
        observationThreshold: observationThreshold ?? 30_000,
        reflectionThreshold: reflectionThreshold ?? 40_000,
        cavemanObservations: cavemanObservations ?? false,
        observeAttachments: observeAttachments ?? 'auto',
        omScope: snapshot.omScope ?? 'thread'
      }
    },

    /**
     * 更新 OM 配置。未指定的字段保持不变；更新广播到全部会话（新会话创建时
     * 重放），并持久化到 settings.json 供下次启动由 SDK 播种。omScope 无对应
     * settings 字段，仅在当前运行实例内生效。
     */
    update: async (input: UpdateRuntimeOmInput): Promise<RuntimeOmStatus> => {
      const updates: Partial<MastraCodeState> = {}

      if (input.observerModelId !== undefined) {
        updates.observerModelId = defineRuntimeModel(input.observerModelId)
      }
      if (input.reflectorModelId !== undefined) {
        updates.reflectorModelId = defineRuntimeModel(input.reflectorModelId)
      }
      if (input.observationThreshold !== undefined) {
        updates.observationThreshold = positiveInt('observationThreshold', input.observationThreshold)
      }
      if (input.reflectionThreshold !== undefined) {
        updates.reflectionThreshold = positiveInt('reflectionThreshold', input.reflectionThreshold)
      }
      if (input.cavemanObservations !== undefined) {
        updates.cavemanObservations = input.cavemanObservations
      }
      if (input.observeAttachments !== undefined) {
        updates.observeAttachments = input.observeAttachments
      }
      if (input.scope !== undefined) {
        updates.omScope = input.scope
      }

      if (Object.keys(updates).length > 0) {
        persistOverrides(updates)
        if (broadcastState) {
          await broadcastState(updates)
        } else {
          await defaultSession.state.set(updates)
        }
      }
      void controller
      const snapshot = state()
      return {
        observerModelId: updates.observerModelId ?? snapshot.observerModelId,
        reflectorModelId: updates.reflectorModelId ?? snapshot.reflectorModelId,
        observationThreshold: updates.observationThreshold ?? snapshot.observationThreshold,
        reflectionThreshold: updates.reflectionThreshold ?? snapshot.reflectionThreshold,
        cavemanObservations: updates.cavemanObservations ?? snapshot.cavemanObservations,
        observeAttachments: updates.observeAttachments ?? snapshot.observeAttachments,
        omScope: updates.omScope ?? snapshot.omScope ?? 'thread'
      }
    }
  }
}

export type RuntimeOmService = ReturnType<typeof createRuntimeOmService>
