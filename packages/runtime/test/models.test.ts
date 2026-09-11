import { describe, expect, it, vi } from 'vitest';
import {
  upsertCustomProviderInSettings,
} from '@mastra/code-sdk/onboarding/custom-providers';
import {
  loadSettings,
  saveSettings,
} from '@mastra/code-sdk/onboarding/settings';
import type {
  AgentController,
  AgentControllerMode,
  AgentControllerSubagent,
  Session,
} from '@mastra/core/agent-controller';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyModelConfigToModes,
  applyModelConfigToSubagents,
  defineRuntimeModel,
  resolveAgentModel,
} from '../src/models/config.js';
import {
  createRuntimeModelService,
  initializeRuntimeModelService,
} from '../src/models/service.js';
import type { RuntimeModelConfig } from '../src/models/types.js';

const defaultModelId = defineRuntimeModel('openai/gpt-5.6-sol');
const fastModelId = defineRuntimeModel('openai/gpt-5-mini');
const reviewModelId = defineRuntimeModel('openai/gpt-5.6-terra');

describe('runtime model config', () => {
  it('validates provider/model identifiers', () => {
    expect(defineRuntimeModel(' openai/gpt-5-mini ')).toBe(
      'openai/gpt-5-mini',
    );
    expect(() => defineRuntimeModel('gpt-5-mini')).toThrow(
      'Expected "provider/model"',
    );
  });

  it('resolves agent-specific models before the default', () => {
    const config: RuntimeModelConfig = {
      defaultModelId,
      agents: { summarizer: fastModelId },
    };

    expect(resolveAgentModel(config, 'summarizer')).toBe(fastModelId);
    expect(resolveAgentModel(config, 'title-generator')).toBe(defaultModelId);
  });

  it('applies mode overrides without mutating definitions', () => {
    const modes: AgentControllerMode[] = [
      { id: 'build', defaultModelId: fastModelId },
      { id: 'review' },
    ];

    const configured = applyModelConfigToModes(modes, {
      defaultModelId,
      modes: { review: reviewModelId },
    });

    expect(configured?.map((mode) => mode.defaultModelId)).toEqual([
      defaultModelId,
      reviewModelId,
    ]);
    expect(modes[0]?.defaultModelId).toBe(fastModelId);
    expect(modes[1]?.defaultModelId).toBeUndefined();
  });

  it('applies subagent-specific, category, and global defaults in order', () => {
    const subagents = [
      createSubagent('reviewer'),
      createSubagent('explore'),
    ];

    const configured = applyModelConfigToSubagents(subagents, {
      defaultModelId,
      subagents: {
        defaultModelId: fastModelId,
        byId: { reviewer: reviewModelId },
      },
    });

    expect(configured?.map((subagent) => subagent.defaultModelId)).toEqual([
      reviewModelId,
      fastModelId,
    ]);
  });
});

describe('runtime model service', () => {
  it('adapts controller and session model APIs', async () => {
    const switchModel = vi.fn().mockResolvedValue(undefined);
    const switchSubagentModel = vi.fn().mockResolvedValue(undefined);
    const session = {
      model: {
        hasSelection: () => true,
        get: () => defaultModelId,
        displayName: () => 'gpt-5.6-sol',
        switch: switchModel,
      },
      mode: { get: () => 'build' },
      subagents: {
        model: {
          get: ({ agentType }: { agentType?: string } = {}) =>
            agentType === 'reviewer' ? reviewModelId : fastModelId,
          set: switchSubagentModel,
        },
      },
    } as unknown as Session;
    const controller = {
      listAvailableModels: vi.fn().mockResolvedValue([
        {
          id: defaultModelId,
          provider: 'openai',
          modelName: 'gpt-5.6-sol',
          hasApiKey: true,
          useCount: 2,
        },
      ]),
    } as unknown as AgentController;

    const service = createRuntimeModelService({ controller, session });

    expect(service.getCurrent()).toEqual({
      modelId: defaultModelId,
      displayName: 'gpt-5.6-sol',
      modeId: 'build',
    });
    expect(await service.listAvailable()).toHaveLength(1);
    expect(service.getSubagentModel('reviewer')).toBe(reviewModelId);

    await service.switchModel({
      modelId: fastModelId,
      scope: 'thread',
      modeId: 'build',
    });
    await service.switchSubagentModel({
      modelId: reviewModelId,
      subagentId: 'reviewer',
    });

    expect(switchModel).toHaveBeenCalledWith({
      modelId: fastModelId,
      scope: 'thread',
      modeId: 'build',
    });
    expect(switchSubagentModel).toHaveBeenCalledWith({
      modelId: reviewModelId,
      agentType: 'reviewer',
    });
  });

  it('initializes the current mode and subagent overrides', async () => {
    const service = {
      getCurrent: vi.fn(),
      listAvailable: vi.fn(),
      getSubagentModel: vi.fn(),
      switchModel: vi.fn().mockResolvedValue(undefined),
      switchSubagentModel: vi.fn().mockResolvedValue(undefined),
    };

    await initializeRuntimeModelService(
      service,
      {
        defaultModelId,
        modes: { review: reviewModelId },
        subagents: {
          defaultModelId: fastModelId,
          byId: { reviewer: reviewModelId },
        },
      },
      'review',
    );

    expect(service.switchModel).toHaveBeenCalledWith({
      modelId: reviewModelId,
      scope: 'global',
    });
    expect(service.switchSubagentModel).toHaveBeenNthCalledWith(1, {
      modelId: fastModelId,
    });
    expect(service.switchSubagentModel).toHaveBeenNthCalledWith(2, {
      modelId: reviewModelId,
      subagentId: 'reviewer',
    });
  });

  it('normalizes Code SDK custom provider model IDs for applications', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mingyi-model-test-'));
    const settingsPath = join(directory, 'settings.json');
    const settings = loadSettings(settingsPath);
    upsertCustomProviderInSettings(settings, {
      name: 'Local Models',
      url: 'http://127.0.0.1:11434/v1',
      models: ['qwen3-coder'],
    });
    saveSettings(settings, settingsPath);
    const controller = {
      listAvailableModels: vi.fn().mockResolvedValue([
        {
          id: 'mastracode/local-models/qwen3-coder',
          provider: 'mastracode/local-models',
          modelName: 'qwen3-coder',
          hasApiKey: true,
          useCount: 0,
        },
      ]),
    } as unknown as AgentController;

    try {
      const service = createRuntimeModelService({
        controller,
        session: {} as Session,
        settingsPath,
      });
      expect(await service.listAvailable()).toEqual([
        expect.objectContaining({
          id: 'local-models/qwen3-coder',
          provider: 'local-models',
          modelName: 'qwen3-coder',
        }),
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function createSubagent(id: string): AgentControllerSubagent {
  return {
    id,
    name: id,
    description: id,
    instructions: id,
  };
}
