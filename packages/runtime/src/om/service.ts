import type { AgentController, Session } from '@mastra/core/agent-controller'
import type { MastraCodeState } from '@mastra/code-sdk/schema'
import { defineRuntimeModel } from '../models/config.js'
import type { RuntimeOmStatus, UpdateRuntimeOmInput } from './types.js'

interface RuntimeOmServiceDependencies {
  controller: AgentController<MastraCodeState>
  defaultSession: Session<MastraCodeState>
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
  defaultSession
}: RuntimeOmServiceDependencies) {
  const state = (): Readonly<MastraCodeState> => defaultSession.state.get()

  return {
    /** 读取当前 OM 配置（Controller state 快照）。 */
    getStatus: (): RuntimeOmStatus => {
      const snapshot = state()
      return {
        observerModelId: snapshot.observerModelId,
        reflectorModelId: snapshot.reflectorModelId,
        observationThreshold: snapshot.observationThreshold,
        reflectionThreshold: snapshot.reflectionThreshold,
        cavemanObservations: snapshot.cavemanObservations,
        observeAttachments: snapshot.observeAttachments,
        omScope: snapshot.omScope ?? 'thread'
      }
    },

    /**
     * 更新 OM 配置。未指定的字段保持不变；所有目标会话共享同一 Controller
     * state，因此更新立即对全部会话生效。
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
        await defaultSession.state.set(updates)
      }
      void controller
      return {
        observerModelId: updates.observerModelId ?? state().observerModelId,
        reflectorModelId: updates.reflectorModelId ?? state().reflectorModelId,
        observationThreshold: updates.observationThreshold ?? state().observationThreshold,
        reflectionThreshold: updates.reflectionThreshold ?? state().reflectionThreshold,
        cavemanObservations: updates.cavemanObservations ?? state().cavemanObservations,
        observeAttachments: updates.observeAttachments ?? state().observeAttachments,
        omScope: updates.omScope ?? state().omScope ?? 'thread'
      }
    }
  }
}

export type RuntimeOmService = ReturnType<typeof createRuntimeOmService>
