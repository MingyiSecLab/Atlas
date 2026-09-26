import { getOAuthProviders } from '@mastra/code-sdk/auth/storage';
import type { AuthStorage } from '@mastra/code-sdk/auth/storage';
import {
  removeCustomProviderFromSettings,
  upsertCustomProviderInSettings,
} from '@mastra/code-sdk/onboarding/custom-providers';
import {
  getCustomProviderId,
  loadSettings,
  saveSettings,
} from '@mastra/code-sdk/onboarding/settings';
import type { AgentController } from '@mastra/core/agent-controller';
import { getProviderConfig } from '@mastra/core/llm';
import type {
  LoginRuntimeProviderInput,
  RuntimeProviderInfo,
  RuntimeProviderOAuthInfo,
  RuntimeProviderService,
  RuntimeCustomProviderInfo,
  SetRuntimeProviderApiKeyInput,
  UpsertRuntimeCustomProviderInput,
} from './types.js';

interface RuntimeProviderServiceDependencies {
  controller: AgentController;
  authStorage: AuthStorage;
  environment?: NodeJS.ProcessEnv;
  settingsPath?: string;
}

function credentialProviderId(provider: string): string {
  return provider === 'openai' ? 'openai-codex' : provider;
}

function catalogProviderId(credentialProvider: string): string {
  return credentialProvider === 'openai-codex' ? 'openai' : credentialProvider;
}

function normalizeProvider(provider: string): string {
  const normalized = provider.trim();
  if (!normalized || /\s/.test(normalized)) {
    throw new Error('Provider ID must be a non-empty value without whitespace.');
  }
  return normalized;
}

function normalizeProtocol(
  value: unknown,
  fallback?: string
): 'openai-chat' | 'openai-responses' | 'anthropic' {
  // fallback 同样只接受合法值：非法输入一律回退 openai-chat，而不是继承旧值
  const allowed = value === 'openai-chat' || value === 'openai-responses' || value === 'anthropic'
  const fallbackAllowed =
    fallback === 'openai-chat' || fallback === 'openai-responses' || fallback === 'anthropic'
  return allowed ? value : fallbackAllowed ? (fallback as 'openai-chat') : 'openai-chat'
}

function customProviderInfo(provider: {
  name: string;
  url: string;
  apiKey?: string;
  models: string[];
  protocol?: 'openai-chat' | 'openai-responses' | 'anthropic';
  maxOutputTokens?: number;
}): RuntimeCustomProviderInfo {
  return {
    id: getCustomProviderId(provider.name),
    name: provider.name,
    url: provider.url,
    models: [...provider.models],
    protocol: normalizeProtocol(provider.protocol),
    ...(typeof provider.maxOutputTokens === 'number' && provider.maxOutputTokens > 0
      ? { maxOutputTokens: Math.floor(provider.maxOutputTokens) }
      : {}),
    hasApiKey: Boolean(provider.apiKey),
  };
}

function customProviderUrl(value: string): string {
  const url = value.trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
  } catch {
    throw new Error('Custom provider URL must be a valid HTTP(S) URL.');
  }
  return url.replace(/\/+$/, '');
}

function customProviderModels(values: string[]): string[] {
  const models = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (models.length === 0) throw new Error('Custom provider must include at least one model.');
  if (models.some((model) => /\s/.test(model))) {
    throw new Error('Custom model IDs must not contain whitespace.');
  }
  return models;
}

function oauthProviders(): RuntimeProviderOAuthInfo[] {
  return getOAuthProviders()
    .map((provider) => ({
      provider: catalogProviderId(provider.id),
      credentialProvider: provider.id,
      name: provider.name,
      authModes: (provider.authModes ?? []).map((mode) => ({ ...mode })),
    }))
    .sort((first, second) => first.provider.localeCompare(second.provider));
}

function providerEnvironmentVariables(provider: string, catalogEnvVar?: string): string[] {
  const configured = getProviderConfig(provider)?.apiKeyEnvVar;
  const candidates = [
    catalogEnvVar,
    ...(Array.isArray(configured) ? configured : configured ? [configured] : []),
  ];
  return [...new Set(candidates.filter((value): value is string => Boolean(value)))];
}

export function createRuntimeProviderService({
  controller,
  authStorage,
  environment = process.env,
  settingsPath,
}: RuntimeProviderServiceDependencies): RuntimeProviderService {
  const listOAuth = (): RuntimeProviderOAuthInfo[] => oauthProviders();

  const list = async (): Promise<RuntimeProviderInfo[]> => {
    authStorage.reload();
    const models = await controller.listAvailableModels();
    const customProviderIds = new Set(
      loadSettings(settingsPath).customProviders.flatMap((provider) => {
        const id = getCustomProviderId(provider.name);
        return [id, `mastracode/${id}`];
      }),
    );
    const oauthByProvider = new Map(listOAuth().map((provider) => [provider.provider, provider]));
    const providers = new Map<string, RuntimeProviderInfo>();

    for (const model of models) {
      if (customProviderIds.has(model.provider)) continue;
      if (providers.has(model.provider)) continue;

      const config = getProviderConfig(model.provider);
      const envVars = providerEnvironmentVariables(model.provider, model.apiKeyEnvVar);
      const authProvider = credentialProviderId(model.provider);
      const isOAuthAuthenticated = authStorage.isLoggedIn(authProvider);
      const hasStoredApiKey = authStorage.hasStoredApiKey(model.provider);
      let source: RuntimeProviderInfo['source'] = 'none';

      if (isOAuthAuthenticated) {
        source = 'oauth';
      } else if (hasStoredApiKey) {
        source = 'stored';
      } else if (envVars.some((envVar) => Boolean(environment[envVar])) || model.hasApiKey) {
        source = 'env';
      }

      providers.set(model.provider, {
        provider: model.provider,
        name: config?.name ?? model.provider,
        source,
        hasStoredApiKey,
        isOAuthAuthenticated,
        envVars,
        ...(config?.docUrl ? { docUrl: config.docUrl } : {}),
        ...(oauthByProvider.has(model.provider) ? { oauth: oauthByProvider.get(model.provider) } : {}),
      });
    }

    return [...providers.values()].sort((first, second) => first.provider.localeCompare(second.provider));
  };

  const requireProvider = async (provider: string): Promise<RuntimeProviderInfo> => {
    const normalized = normalizeProvider(provider);
    const info = (await list()).find((candidate) => candidate.provider === normalized);
    if (!info) throw new Error(`Unknown model provider: ${normalized}`);
    return info;
  };

  const requireOAuthProvider = (provider: string): RuntimeProviderOAuthInfo => {
    const normalized = normalizeProvider(provider);
    const info = listOAuth().find(
      (candidate) => candidate.provider === normalized || candidate.credentialProvider === normalized,
    );
    if (!info) throw new Error(`Provider does not support OAuth: ${normalized}`);
    return info;
  };

  const invalidateCatalog = (): void => {
    controller.invalidateAvailableModelsCache();
  };

  const listCustom = (): RuntimeCustomProviderInfo[] =>
    loadSettings(settingsPath).customProviders
      .map(customProviderInfo)
      .sort((first, second) => first.name.localeCompare(second.name));

  return {
    list,
    listOAuth,

    setApiKey: async ({ provider, key }: SetRuntimeProviderApiKeyInput) => {
      const info = await requireProvider(provider);
      const normalizedKey = key.trim();
      if (!normalizedKey) throw new Error('API key must not be empty.');

      authStorage.setStoredApiKey(info.provider, normalizedKey, info.envVars[0]);
      invalidateCatalog();
    },

    removeApiKey: async (provider: string) => {
      const info = await requireProvider(provider);
      const storedKey = authStorage.getStoredApiKey(info.provider);
      authStorage.remove(`apikey:${info.provider}`);

      for (const envVar of info.envVars) {
        if (storedKey && environment[envVar] === storedKey) delete environment[envVar];
      }
      invalidateCatalog();
    },

    login: async ({ provider, callbacks }: LoginRuntimeProviderInput) => {
      const info = requireOAuthProvider(provider);
      await authStorage.login(info.credentialProvider, callbacks);
      invalidateCatalog();
    },

    logout: async (provider: string) => {
      const info = requireOAuthProvider(provider);
      authStorage.logout(info.credentialProvider);
      invalidateCatalog();
    },

    listCustom,

    upsertCustom: async (input: UpsertRuntimeCustomProviderInput) => {
      const settings = loadSettings(settingsPath);
      const name = input.name.trim();
      if (!name) throw new Error('Custom provider name must not be empty.');
      const nextId = getCustomProviderId(name);
      const previousId = input.previousId ? normalizeProvider(input.previousId) : undefined;
      const existing = settings.customProviders.find(
        (provider) => getCustomProviderId(provider.name) === (previousId ?? nextId),
      );
      if (!previousId && existing) throw new Error(`Custom provider already exists: ${nextId}`);
      if (
        previousId &&
        nextId !== previousId &&
        settings.customProviders.some((provider) => getCustomProviderId(provider.name) === nextId)
      ) {
        throw new Error(`Custom provider already exists: ${nextId}`);
      }

      const apiKey = input.apiKey?.trim() || existing?.apiKey;
      // 协议解析：显式传入合法值 → 生效；省略 → 继承既有值；非法值 → 回退 openai-chat
      const protocol = normalizeProtocol(
        input.protocol,
        input.protocol === undefined ? existing?.protocol : undefined
      );
      // maxOutputTokens：显式传入正数 → 生效；省略 → 继承既有值
      const existingMaxOutputTokens =
        typeof existing?.maxOutputTokens === 'number' && existing.maxOutputTokens > 0
          ? existing.maxOutputTokens
          : undefined;
      const maxOutputTokens =
        typeof input.maxOutputTokens === 'number' && input.maxOutputTokens > 0
          ? Math.floor(input.maxOutputTokens)
          : existingMaxOutputTokens;
      upsertCustomProviderInSettings(
        settings,
        {
          name,
          url: customProviderUrl(input.url),
          ...(apiKey ? { apiKey } : {}),
          models: customProviderModels(input.models),
          protocol,
          ...(maxOutputTokens ? { maxOutputTokens } : {}),
        },
        previousId,
      );
      saveSettings(settings, settingsPath);
      invalidateCatalog();
      const saved = settings.customProviders.find(
        (provider) => getCustomProviderId(provider.name) === nextId,
      );
      if (!saved) throw new Error(`Failed to save custom provider: ${nextId}`);
      return customProviderInfo(saved);
    },

    removeCustom: async (providerId: string) => {
      const id = normalizeProvider(providerId);
      const settings = loadSettings(settingsPath);
      if (!settings.customProviders.some((provider) => getCustomProviderId(provider.name) === id)) {
        throw new Error(`Unknown custom provider: ${id}`);
      }
      removeCustomProviderFromSettings(settings, id);
      // 清理 models 中的残留失效配置（防止 Observational Memory 等后台服务因孤立引用报错）
      if (settings.models) {
        if (settings.models.observerModelOverride?.startsWith(`${id}/`)) {
          settings.models.observerModelOverride = null;
        }
        if (settings.models.reflectorModelOverride?.startsWith(`${id}/`)) {
          settings.models.reflectorModelOverride = null;
        }
        if (settings.models.goalJudgeModel?.startsWith(`${id}/`)) {
          settings.models.goalJudgeModel = null;
        }
        if (settings.models.omModelOverride?.startsWith(`${id}/`)) {
          settings.models.omModelOverride = null;
        }
        if (settings.models.modeDefaults) {
          for (const [mode, modelId] of Object.entries(settings.models.modeDefaults)) {
            if (modelId?.startsWith(`${id}/`)) {
              delete settings.models.modeDefaults[mode];
            }
          }
        }
      }
      saveSettings(settings, settingsPath);
      invalidateCatalog();
    },
  };
}
