import type { AuthStorage } from '@mastra/code-sdk/auth/storage';
import type { OAuthLoginCallbacks } from '@mastra/code-sdk/auth/types';
import { loadSettings } from '@mastra/code-sdk/onboarding/settings';
import type { AgentController, AvailableModel } from '@mastra/core/agent-controller';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeProviderService } from '../src/providers/service.js';

function model(provider: string, envVar: string, hasApiKey = false): AvailableModel {
  return {
    id: `${provider}/test-model`,
    provider,
    modelName: 'test-model',
    hasApiKey,
    apiKeyEnvVar: envVar,
    useCount: 0,
  };
}

function createAuthStorage(options?: {
  oauth?: string[];
  stored?: Record<string, string>;
}) {
  const oauth = new Set(options?.oauth ?? []);
  const stored = new Map(Object.entries(options?.stored ?? {}));
  const setStoredApiKey = vi.fn((provider: string, key: string) => {
    stored.set(provider, key);
  });
  const remove = vi.fn((slot: string) => {
    if (slot.startsWith('apikey:')) stored.delete(slot.slice('apikey:'.length));
  });
  const login = vi.fn(async (provider: string) => {
    oauth.add(provider);
  });
  const logout = vi.fn((provider: string) => {
    oauth.delete(provider);
  });

  return {
    authStorage: {
      reload: vi.fn(),
      isLoggedIn: vi.fn((provider: string) => oauth.has(provider)),
      hasStoredApiKey: vi.fn((provider: string) => stored.has(provider)),
      getStoredApiKey: vi.fn((provider: string) => stored.get(provider)),
      setStoredApiKey,
      remove,
      login,
      logout,
    } as unknown as AuthStorage,
    stored,
    setStoredApiKey,
    remove,
    login,
    logout,
  };
}

describe('runtime provider service', () => {
  it('lists deduplicated providers with credential source precedence and no secrets', async () => {
    const controller = {
      listAvailableModels: vi.fn().mockResolvedValue([
        model('openai', 'OPENAI_API_KEY'),
        { ...model('openai', 'OPENAI_API_KEY'), id: 'openai/other-model' },
        model('anthropic', 'ANTHROPIC_API_KEY'),
        model('deepseek', 'DEEPSEEK_API_KEY'),
      ]),
      invalidateAvailableModelsCache: vi.fn(),
    } as unknown as AgentController;
    const { authStorage } = createAuthStorage({
      oauth: ['openai-codex'],
      stored: { anthropic: 'stored-anthropic-secret' },
    });
    const environment = { DEEPSEEK_API_KEY: 'shell-deepseek-secret' } as NodeJS.ProcessEnv;
    const service = createRuntimeProviderService({ controller, authStorage, environment });

    const providers = await service.list();

    expect(providers.map((provider) => [provider.provider, provider.source])).toEqual([
      ['anthropic', 'stored'],
      ['deepseek', 'env'],
      ['openai', 'oauth'],
    ]);
    expect(providers.find((provider) => provider.provider === 'openai')?.oauth).toEqual(
      expect.objectContaining({ provider: 'openai', credentialProvider: 'openai-codex' }),
    );
    expect(providers.find((provider) => provider.provider === 'openai')).toEqual(
      expect.objectContaining({ isOAuthAuthenticated: true, hasStoredApiKey: false }),
    );
    expect(providers.find((provider) => provider.provider === 'anthropic')).toEqual(
      expect.objectContaining({ isOAuthAuthenticated: false, hasStoredApiKey: true }),
    );
    expect(JSON.stringify(providers)).not.toContain('stored-anthropic-secret');
    expect(JSON.stringify(providers)).not.toContain('shell-deepseek-secret');
  });

  it('stores and removes an API key while invalidating the model catalog', async () => {
    const invalidateAvailableModelsCache = vi.fn();
    const controller = {
      listAvailableModels: vi.fn().mockResolvedValue([model('openai', 'OPENAI_API_KEY')]),
      invalidateAvailableModelsCache,
    } as unknown as AgentController;
    const { authStorage, setStoredApiKey, remove } = createAuthStorage();
    const environment = {} as NodeJS.ProcessEnv;
    const service = createRuntimeProviderService({ controller, authStorage, environment });

    await service.setApiKey({ provider: 'openai', key: '  sk-test-secret  ' });

    expect(setStoredApiKey).toHaveBeenCalledWith('openai', 'sk-test-secret', 'OPENAI_API_KEY');
    expect(await service.list()).toEqual([
      expect.objectContaining({ provider: 'openai', source: 'stored' }),
    ]);

    environment.OPENAI_API_KEY = 'sk-test-secret';
    await service.removeApiKey('openai');

    expect(remove).toHaveBeenCalledWith('apikey:openai');
    expect(environment.OPENAI_API_KEY).toBeUndefined();
    expect(invalidateAvailableModelsCache).toHaveBeenCalledTimes(2);
  });

  it('preserves a shell credential when removing a different stored key', async () => {
    const controller = {
      listAvailableModels: vi.fn().mockResolvedValue([model('anthropic', 'ANTHROPIC_API_KEY')]),
      invalidateAvailableModelsCache: vi.fn(),
    } as unknown as AgentController;
    const { authStorage } = createAuthStorage({ stored: { anthropic: 'stored-secret' } });
    const environment = { ANTHROPIC_API_KEY: 'shell-secret' } as NodeJS.ProcessEnv;
    const service = createRuntimeProviderService({ controller, authStorage, environment });

    await service.removeApiKey('anthropic');

    expect(environment.ANTHROPIC_API_KEY).toBe('shell-secret');
  });

  it('maps catalog provider IDs to Code SDK OAuth credential slots', async () => {
    const controller = {
      listAvailableModels: vi.fn().mockResolvedValue([model('openai', 'OPENAI_API_KEY')]),
      invalidateAvailableModelsCache: vi.fn(),
    } as unknown as AgentController;
    const { authStorage, login, logout } = createAuthStorage();
    const service = createRuntimeProviderService({ controller, authStorage, environment: {} });
    const callbacks: OAuthLoginCallbacks = {
      onAuth: vi.fn(),
      onPrompt: vi.fn().mockResolvedValue('code'),
    };

    await service.login({ provider: 'openai', callbacks });
    await service.logout('openai');

    expect(login).toHaveBeenCalledWith('openai-codex', callbacks);
    expect(logout).toHaveBeenCalledWith('openai-codex');
    expect(controller.invalidateAvailableModelsCache).toHaveBeenCalledTimes(2);
  });

  it('rejects unknown providers and empty API keys', async () => {
    const controller = {
      listAvailableModels: vi.fn().mockResolvedValue([model('openai', 'OPENAI_API_KEY')]),
      invalidateAvailableModelsCache: vi.fn(),
    } as unknown as AgentController;
    const { authStorage } = createAuthStorage();
    const service = createRuntimeProviderService({ controller, authStorage, environment: {} });

    await expect(service.setApiKey({ provider: 'unknown', key: 'secret' })).rejects.toThrow(
      'Unknown model provider',
    );
    await expect(service.setApiKey({ provider: 'openai', key: '   ' })).rejects.toThrow(
      'API key must not be empty',
    );
    await expect(service.login({ provider: 'deepseek', callbacks: {} as OAuthLoginCallbacks })).rejects.toThrow(
      'does not support OAuth',
    );
  });

  it('manages Code SDK custom providers without returning API keys', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mingyi-provider-test-'));
    const settingsPath = join(directory, 'settings.json');
    const invalidateAvailableModelsCache = vi.fn();
    const listAvailableModels = vi.fn().mockResolvedValue([]);
    const controller = {
      listAvailableModels,
      invalidateAvailableModelsCache,
    } as unknown as AgentController;
    const { authStorage } = createAuthStorage();
    const service = createRuntimeProviderService({
      controller,
      authStorage,
      environment: {},
      settingsPath,
    });

    try {
      const created = await service.upsertCustom({
        name: 'Local Gateway',
        url: 'https://models.example.com/v1/',
        apiKey: 'custom-secret',
        models: [' model-a ', 'model-a', 'model-b'],
      });
      expect(created).toEqual({
        id: 'local-gateway',
        name: 'Local Gateway',
        url: 'https://models.example.com/v1',
        hasApiKey: true,
        models: ['model-a', 'model-b'],
        protocol: 'openai-chat',
      });
      expect(JSON.stringify(service.listCustom())).not.toContain('custom-secret');
      listAvailableModels.mockResolvedValue([
        model('mastracode/local-gateway', ''),
      ]);
      expect(await service.list()).toEqual([]);

      await service.upsertCustom({
        previousId: 'local-gateway',
        name: 'Local Models',
        url: 'http://127.0.0.1:11434/v1',
        models: ['model-c'],
      });
      expect(service.listCustom()).toEqual([
        expect.objectContaining({ id: 'local-models', hasApiKey: true, models: ['model-c'] }),
      ]);
      expect(loadSettings(settingsPath).customProviders[0]?.apiKey).toBe('custom-secret');

      await service.removeCustom('local-models');
      expect(service.listCustom()).toEqual([]);
      expect(invalidateAvailableModelsCache).toHaveBeenCalledTimes(3);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('persists the custom provider protocol through the SDK settings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mingyi-provider-protocol-'));
    const settingsPath = join(directory, 'settings.json');
    const controller = {
      listAvailableModels: vi.fn().mockResolvedValue([]),
      invalidateAvailableModelsCache: vi.fn(),
    } as unknown as AgentController;
    const { authStorage } = createAuthStorage();
    const service = createRuntimeProviderService({
      controller,
      authStorage,
      environment: {},
      settingsPath,
    });

    try {
      const created = await service.upsertCustom({
        name: 'Anthropic Gateway',
        url: 'https://relay.example.com',
        models: ['claude-proxy'],
        protocol: 'anthropic',
      });
      expect(created.protocol).toBe('anthropic');
      expect(loadSettings(settingsPath).customProviders[0]?.protocol).toBe('anthropic');

      // 编辑时省略 protocol → 保留原值；显式改写 → 生效
      await service.upsertCustom({
        previousId: 'anthropic-gateway',
        name: 'Anthropic Gateway Renamed',
        url: 'https://relay.example.com/v1',
        models: ['claude-proxy'],
      });
      expect(service.listCustom()[0]?.protocol).toBe('anthropic');

      await service.upsertCustom({
        previousId: 'anthropic-gateway-renamed',
        name: 'Responses Gateway',
        url: 'https://relay.example.com/v2',
        models: ['gpt-proxy'],
        protocol: 'openai-responses',
      });
      expect(service.listCustom()[0]?.protocol).toBe('openai-responses');

      // 非法值 → 不继承旧值，回退默认 openai-chat
      await service.upsertCustom({
        previousId: 'responses-gateway',
        name: 'Bogus Gateway',
        url: 'https://relay.example.com/v3',
        models: ['m'],
        protocol: 'grpc' as never,
      });
      expect(service.listCustom()[0]?.protocol).toBe('openai-chat');

      // 完全省略 protocol（无既有值）→ 缺省 openai-chat
      await service.upsertCustom({
        previousId: 'bogus-gateway',
        name: 'Default Gateway',
        url: 'https://relay.example.com/v4',
        models: ['m'],
      });
      expect(service.listCustom()[0]?.protocol).toBe('openai-chat');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
