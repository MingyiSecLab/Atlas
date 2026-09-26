import type { OAuthLoginCallbacks } from '@mastra/code-sdk/auth/types';

/** Provider 当前生效凭据的来源；Runtime 永不返回凭据明文。 */
export type RuntimeProviderCredentialSource = 'oauth' | 'stored' | 'env' | 'none';

export interface RuntimeProviderOAuthMode {
  id: string;
  name: string;
  description?: string;
}

export interface RuntimeProviderOAuthInfo {
  /** 模型目录使用的 Provider ID，例如 `openai`。 */
  provider: string;
  /** Code SDK AuthStorage 使用的槽位，例如 `openai-codex`。 */
  credentialProvider: string;
  name: string;
  authModes: RuntimeProviderOAuthMode[];
}

export interface RuntimeProviderInfo {
  provider: string;
  name: string;
  source: RuntimeProviderCredentialSource;
  /** 是否存在 Runtime 持久化的 API Key；不包含 Key 明文。 */
  hasStoredApiKey: boolean;
  /** 当前是否已通过 OAuth 登录；不包含 Token 明文。 */
  isOAuthAuthenticated: boolean;
  envVars: string[];
  docUrl?: string;
  oauth?: RuntimeProviderOAuthInfo;
}

export interface SetRuntimeProviderApiKeyInput {
  provider: string;
  key: string;
}

/**
 * 自定义 Provider 的接口协议。
 * `openai-chat`（默认）OpenAI Chat Completions；`openai-responses` OpenAI Responses API；
 * `anthropic` Anthropic Messages API。协议分发由 @mastra/code-sdk 的 patch 实现。
 */
export type RuntimeCustomProviderProtocol = 'openai-chat' | 'openai-responses' | 'anthropic';

export interface RuntimeCustomProviderInfo {
  id: string;
  name: string;
  url: string;
  models: string[];
  /** 接口协议；缺省 `openai-chat`。 */
  protocol: RuntimeCustomProviderProtocol;
  /** 该 Provider 的默认最大输出 token 数（调用未指定时生效，缺省 32768）。 */
  maxOutputTokens?: number;
  /** 自定义 Provider 是否保存了 API Key；不包含 Key 明文。 */
  hasApiKey: boolean;
}

export interface UpsertRuntimeCustomProviderInput {
  /** 编辑时传入原 Provider ID；创建时省略。 */
  previousId?: string;
  name: string;
  url: string;
  /** 留空时，编辑操作保留已有 Key。 */
  apiKey?: string;
  models: string[];
  /** 接口协议；编辑时省略则保留原值，缺省 `openai-chat`。 */
  protocol?: RuntimeCustomProviderProtocol;
  /**
   * 该 Provider 的默认最大输出 token 数；模型调用未指定 maxOutputTokens 时生效
   * （缺省 32768）。修复小默认值网关把长回答截断（finish reason "length"）的问题。
   * 编辑时省略则保留原值。
   */
  maxOutputTokens?: number;
}

export interface LoginRuntimeProviderInput {
  provider: string;
  callbacks: OAuthLoginCallbacks;
}

export interface RuntimeProviderService {
  /** 列出 Provider 和凭据状态，不返回 API Key 或 OAuth Token。 */
  list(): Promise<RuntimeProviderInfo[]>;
  /** 将 API Key 写入 Code SDK AuthStorage。 */
  setApiKey(input: SetRuntimeProviderApiKeyInput): Promise<void>;
  /** 删除 Runtime 存储的 API Key；不会删除用户 shell 中独立设置的 Key。 */
  removeApiKey(provider: string): Promise<void>;
  /** 列出 Code SDK 当前支持的 OAuth Provider。 */
  listOAuth(): RuntimeProviderOAuthInfo[];
  login(input: LoginRuntimeProviderInput): Promise<void>;
  logout(provider: string): Promise<void>;
  /** 列出 Code SDK settings.json 中的自定义 OpenAI-compatible Provider。 */
  listCustom(): RuntimeCustomProviderInfo[];
  /** 使用 Code SDK 官方 helper 新增或更新自定义 Provider。 */
  upsertCustom(input: UpsertRuntimeCustomProviderInput): Promise<RuntimeCustomProviderInfo>;
  removeCustom(providerId: string): Promise<void>;
}

export type RuntimeProviderOAuthCallbacks = OAuthLoginCallbacks;
