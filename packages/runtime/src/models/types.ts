/** Runtime 统一使用 Mastra Model Router 的 `provider/model` 标识。 */
export type RuntimeModelId = `${string}/${string}`;

/**
 * Runtime 的声明式模型配置。
 *
 * 优先级：目标专用配置 > 目标类别默认值 > 全局默认值 > 资源自身默认值。
 */
export interface RuntimeModelConfig {
  /** Agent、Mode 和 Subagent 共用的后备模型。 */
  defaultModelId?: RuntimeModelId;

  /** 普通 Mastra Agent 按 Agent ID 配置的模型。 */
  agents?: Readonly<Record<string, RuntimeModelId>>;

  /** Code SDK Mode 按 Mode ID 配置的默认模型。 */
  modes?: Readonly<Record<string, RuntimeModelId>>;

  /** Code SDK Subagent 的默认模型和按类型覆盖。 */
  subagents?: {
    defaultModelId?: RuntimeModelId;
    byId?: Readonly<Record<string, RuntimeModelId>>;
  };
}

export type RuntimeModelScope = 'global' | 'thread';

export interface SwitchRuntimeModelInput {
  modelId: RuntimeModelId;
  /** `thread` 会按当前 Mode 持久化；`global` 只影响当前 Session。 */
  scope?: RuntimeModelScope;
  /** 为指定 Mode 保存模型；省略时使用当前 Mode。 */
  modeId?: string;
}

export interface SwitchSubagentModelInput {
  modelId: RuntimeModelId;
  /** 省略时设置所有 Subagent 的 Session 默认模型。 */
  subagentId?: string;
}

export interface RuntimeModelSelection {
  modelId: string | null;
  displayName: string;
  modeId: string;
}

export interface RuntimeModelInfo {
  id: string;
  provider: string;
  modelName: string;
  hasApiKey: boolean;
  apiKeyEnvVar?: string;
  useCount: number;
}

export interface RuntimeModelService {
  getCurrent(): RuntimeModelSelection;
  listAvailable(): Promise<RuntimeModelInfo[]>;
  switchModel(input: SwitchRuntimeModelInput): Promise<void>;
  getSubagentModel(subagentId?: string): string | null;
  switchSubagentModel(input: SwitchSubagentModelInput): Promise<void>;
}
