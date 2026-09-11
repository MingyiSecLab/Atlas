import type {
  RuntimeCustomProviderInfo,
  RuntimeProviderInfo,
  RuntimeProviderOAuthInfo,
  UpsertRuntimeCustomProviderInput
} from '@mingyi/runtime'

export const PROVIDER_IPC = {
  list: 'providers:list',
  setApiKey: 'providers:set-api-key',
  removeApiKey: 'providers:remove-api-key',
  listOAuth: 'providers:list-oauth',
  loginOAuth: 'providers:login-oauth',
  logoutOAuth: 'providers:logout-oauth',
  cancelOAuth: 'providers:cancel-oauth',
  oauthEvent: 'providers:oauth-event',
  changed: 'providers:changed',
  respondOAuthPrompt: 'providers:respond-oauth-prompt',
  listCustom: 'providers:list-custom',
  upsertCustom: 'providers:upsert-custom',
  removeCustom: 'providers:remove-custom',
  fetchCustomModels: 'providers:fetch-custom-models',
  testCustomModel: 'providers:test-custom-model'
} as const

export type ProviderOAuthEvent =
  | {
      type: 'auth'
      provider: string
      url: string
      instructions?: string
    }
  | {
      type: 'prompt'
      provider: string
      requestId: string
      message: string
      placeholder?: string
      allowEmpty?: boolean
    }
  | {
      type: 'progress'
      provider: string
      message: string
    }
  | {
      type: 'complete'
      provider: string
    }
  | {
      type: 'error'
      provider: string
      message: string
    }

export interface ProviderOAuthPromptResponse {
  requestId: string
  value: string
}

export interface ProviderOAuthLoginInput {
  provider: string
  authMode?: string
}

export interface TestCustomModelInput {
  url: string
  apiKey?: string
  model: string
  protocol?: 'openai-chat' | 'openai-responses' | 'anthropic'
}

export interface FetchCustomModelsInput {
  url: string
  apiKey?: string
  protocol?: 'openai-chat' | 'openai-responses' | 'anthropic'
}

export interface TestCustomModelResult {
  ok: boolean
  latencyMs: number
}

export interface ProviderBridge {
  list(): Promise<RuntimeProviderInfo[]>
  setApiKey(input: { provider: string; key: string }): Promise<void>
  removeApiKey(provider: string): Promise<void>
  listOAuth(): Promise<RuntimeProviderOAuthInfo[]>
  loginOAuth(input: ProviderOAuthLoginInput): Promise<void>
  logoutOAuth(provider: string): Promise<void>
  cancelOAuth(provider: string): Promise<void>
  respondOAuthPrompt(input: ProviderOAuthPromptResponse): Promise<void>
  listCustom(): Promise<RuntimeCustomProviderInfo[]>
  upsertCustom(input: UpsertRuntimeCustomProviderInput): Promise<RuntimeCustomProviderInfo>
  removeCustom(providerId: string): Promise<void>
  fetchCustomModels(input: FetchCustomModelsInput): Promise<string[]>
  testCustomModel(input: TestCustomModelInput): Promise<TestCustomModelResult>
  onChanged(listener: () => void): () => void
  onOAuthEvent(listener: (event: ProviderOAuthEvent) => void): () => void
}
