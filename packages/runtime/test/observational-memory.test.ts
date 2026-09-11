import { describe, it, expect } from 'vitest'
import {
  createControllerConfig,
  applyOmConfigToInitialState
} from '../src/index.js'

describe('observational memory configuration', () => {
  it('does not set initialState when observationalMemory is omitted', () => {
    const config = createControllerConfig({
      workspacePath: '/tmp/test-workspace'
    })
    expect(config.initialState).toBeUndefined()
  })

  it('does not set initialState for an empty observationalMemory config', () => {
    const config = createControllerConfig({
      workspacePath: '/tmp/test-workspace',
      observationalMemory: {}
    })
    expect(config.initialState).toBeUndefined()
  })

  it('writes observer and reflector models into initialState', () => {
    const config = createControllerConfig({
      workspacePath: '/tmp/test-workspace',
      observationalMemory: {
        observerModelId: 'openai/gpt-5-mini',
        reflectorModelId: 'deepseek/deepseek-reasoner'
      }
    })
    expect(config.initialState?.observerModelId).toBe('openai/gpt-5-mini')
    expect(config.initialState?.reflectorModelId).toBe('deepseek/deepseek-reasoner')
  })

  it('writes thresholds, caveman mode, attachment policy and scope', () => {
    const config = createControllerConfig({
      workspacePath: '/tmp/test-workspace',
      observationalMemory: {
        observationThreshold: 24000,
        reflectionThreshold: 32000,
        cavemanObservations: true,
        observeAttachments: false,
        scope: 'thread'
      }
    })
    expect(config.initialState?.observationThreshold).toBe(24000)
    expect(config.initialState?.reflectionThreshold).toBe(32000)
    expect(config.initialState?.cavemanObservations).toBe(true)
    expect(config.initialState?.observeAttachments).toBe(false)
    expect(config.initialState?.omScope).toBe('thread')
  })

  it('normalizes model IDs to provider/model form', () => {
    const initialState = applyOmConfigToInitialState(undefined, {
      observerModelId: 'anthropic/claude-haiku-4-5'
    })
    expect(initialState?.observerModelId).toBe('anthropic/claude-haiku-4-5')
  })

  it('rejects model IDs without a provider prefix', () => {
    expect(() =>
      applyOmConfigToInitialState(undefined, {
        observerModelId: 'gpt-5-mini'
      })
    ).toThrow(/provider\/model/)
  })

  it('rejects non-positive thresholds', () => {
    expect(() =>
      applyOmConfigToInitialState(undefined, { observationThreshold: 0 })
    ).toThrow(/observationThreshold/)
    expect(() =>
      applyOmConfigToInitialState(undefined, { reflectionThreshold: -1 })
    ).toThrow(/reflectionThreshold/)
  })

  it('preserves pre-existing initialState entries', () => {
    const initialState = applyOmConfigToInitialState(
      { yolo: true },
      { scope: 'resource' }
    )
    expect(initialState?.yolo).toBe(true)
    expect(initialState?.omScope).toBe('resource')
  })

  it('returns the original initialState when om config is undefined', () => {
    const existing = { yolo: true }
    expect(applyOmConfigToInitialState(existing, undefined)).toBe(existing)
  })
})
