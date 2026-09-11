import type {
  AgentController,
  Session,
} from '@mastra/core/agent-controller';
import {
  loadSettings,
  stripMastraCodeCustomProviderPrefix,
} from '@mastra/code-sdk/onboarding/settings';
import { defineRuntimeModel } from './config.js';
import type {
  RuntimeModelConfig,
  RuntimeModelService,
} from './types.js';

interface RuntimeModelServiceDependencies {
  controller: AgentController;
  session: Session;
  settingsPath?: string;
}

export function createRuntimeModelService({
  controller,
  session,
  settingsPath,
}: RuntimeModelServiceDependencies): RuntimeModelService {
  return {
    getCurrent: () => ({
      modelId: session.model.hasSelection() ? session.model.get() : null,
      displayName: session.model.displayName(),
      modeId: session.mode.get(),
    }),

    listAvailable: async () => {
      const models = await controller.listAvailableModels();
      const customProviders = loadSettings(settingsPath).customProviders;
      return models.map((model) => {
        const id = stripMastraCodeCustomProviderPrefix(model.id, customProviders);
        if (id === model.id) return { ...model };
        const [provider, ...modelParts] = id.split('/');
        return {
          ...model,
          id,
          provider: provider ?? model.provider,
          modelName: modelParts.join('/') || model.modelName,
        };
      });
    },

    switchModel: async ({ modelId, scope, modeId }) => {
      await session.model.switch({
        modelId: defineRuntimeModel(modelId),
        ...(scope ? { scope } : {}),
        ...(modeId ? { modeId } : {}),
      });
    },

    getSubagentModel: (subagentId) =>
      session.subagents.model.get(
        subagentId ? { agentType: subagentId } : {},
      ),

    switchSubagentModel: async ({ modelId, subagentId }) => {
      await session.subagents.model.set({
        modelId: defineRuntimeModel(modelId),
        ...(subagentId ? { agentType: subagentId } : {}),
      });
    },
  };
}

/** 应用不依赖 Thread 的启动模型选择。 */
export async function initializeRuntimeModelService(
  service: RuntimeModelService,
  config: RuntimeModelConfig | undefined,
  currentModeId: string,
): Promise<void> {
  if (!config) return;

  const initialModelId =
    config.modes?.[currentModeId] ?? config.defaultModelId;
  if (initialModelId) {
    await service.switchModel({
      modelId: initialModelId,
      scope: 'global',
    });
  }

  if (config.subagents?.defaultModelId) {
    await service.switchSubagentModel({
      modelId: config.subagents.defaultModelId,
    });
  }

  for (const [subagentId, modelId] of Object.entries(
    config.subagents?.byId ?? {},
  )) {
    await service.switchSubagentModel({ modelId, subagentId });
  }
}
