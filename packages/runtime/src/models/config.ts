import type {
  AgentControllerMode,
  AgentControllerSubagent,
} from '@mastra/core/agent-controller';
import type { RuntimeModelConfig, RuntimeModelId } from './types.js';

/** 验证并收窄为 Runtime 通用模型 ID。 */
export function defineRuntimeModel(modelId: string): RuntimeModelId {
  const normalized = modelId.trim();
  const separatorIndex = normalized.indexOf('/');

  if (
    separatorIndex <= 0 ||
    separatorIndex === normalized.length - 1 ||
    /\s/.test(normalized)
  ) {
    throw new Error(
      `Invalid model ID "${modelId}". Expected "provider/model".`,
    );
  }

  return normalized as RuntimeModelId;
}

/** 为普通 Mastra Agent 解析统一模型配置。 */
export function resolveAgentModel(
  config: RuntimeModelConfig,
  agentId: string,
): RuntimeModelId {
  const modelId = config.agents?.[agentId] ?? config.defaultModelId;

  if (!modelId) {
    throw new Error(
      `No model configured for Agent "${agentId}" and no defaultModelId is set.`,
    );
  }

  return defineRuntimeModel(modelId);
}

/** 将 Runtime 模型默认值映射到 Code SDK Modes，不修改调用方数组。 */
export function applyModelConfigToModes(
  modes: AgentControllerMode[] | undefined,
  config: RuntimeModelConfig | undefined,
): AgentControllerMode[] | undefined {
  if (!modes || !config) return modes;

  return modes.map((mode) => {
    const modelId = config.modes?.[mode.id] ?? config.defaultModelId;
    return modelId
      ? { ...mode, defaultModelId: defineRuntimeModel(modelId) }
      : { ...mode };
  });
}

/** 将 Runtime 模型默认值映射到 Code SDK Subagents，不修改调用方数组。 */
export function applyModelConfigToSubagents(
  subagents: AgentControllerSubagent[] | undefined,
  config: RuntimeModelConfig | undefined,
): AgentControllerSubagent[] | undefined {
  if (!subagents || !config) return subagents;

  return subagents.map((subagent) => {
    const modelId =
      config.subagents?.byId?.[subagent.id] ??
      config.subagents?.defaultModelId ??
      config.defaultModelId;

    return modelId
      ? { ...subagent, defaultModelId: defineRuntimeModel(modelId) }
      : { ...subagent };
  });
}
