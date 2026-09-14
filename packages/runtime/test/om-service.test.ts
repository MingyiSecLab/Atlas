import type { MastraCodeState } from '@mastra/code-sdk/schema'
import type { AgentController, Session } from '@mastra/core/agent-controller'
import { loadSettings } from '@mastra/code-sdk/onboarding/settings'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRuntimeOmService } from '../src/om/service.js'

function mockSession(initial: Partial<MastraCodeState> = {}) {
  let snapshot: Partial<MastraCodeState> = { ...initial }
  return {
    session: {
      state: {
        get: () => snapshot,
        set: vi.fn(async (updates: Partial<MastraCodeState>) => {
          snapshot = { ...snapshot, ...updates }
        })
      }
    } as unknown as Session<MastraCodeState>,
    snapshot: () => snapshot
  }
}

const controller = {} as AgentController<MastraCodeState>

describe('runtime om service', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
    tempDirs.length = 0
  })

  it('broadcasts updates instead of writing only the default session state', async () => {
    const defaultMock = mockSession()
    const broadcastState = vi.fn().mockResolvedValue(undefined)
    const om = createRuntimeOmService({
      controller,
      defaultSession: defaultMock.session,
      broadcastState
    })

    const status = await om.update({
      observerModelId: 'bai/qwen3.8-flash',
      reflectorModelId: 'bai/qwen3.8-flash'
    })

    expect(broadcastState).toHaveBeenCalledOnce()
    expect(broadcastState).toHaveBeenCalledWith({
      observerModelId: 'bai/qwen3.8-flash',
      reflectorModelId: 'bai/qwen3.8-flash'
    })
    // 广播模式下不应再单独写 default 会话（广播已覆盖它）
    expect(defaultMock.session.state.set).not.toHaveBeenCalled()
    expect(status.observerModelId).toBe('bai/qwen3.8-flash')
  })

  it('falls back to default session state when no broadcast is provided', async () => {
    const defaultMock = mockSession()
    const om = createRuntimeOmService({ controller, defaultSession: defaultMock.session })

    await om.update({ observationThreshold: 12_000 })

    expect(defaultMock.session.state.set).toHaveBeenCalledWith({ observationThreshold: 12_000 })
    expect((await om.getStatus()).observationThreshold).toBe(12_000)
  })

  it('persists model and threshold overrides to settings.json for SDK boot seeding', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mingyi-om-test-'))
    tempDirs.push(directory)
    const settingsPath = join(directory, 'settings.json')
    const om = createRuntimeOmService({
      controller,
      defaultSession: mockSession().session,
      broadcastState: vi.fn().mockResolvedValue(undefined),
      settingsPath
    })

    await om.update({
      observerModelId: 'bai/qwen3.8-flash',
      reflectorModelId: 'bai/qwen3.8-flash',
      observationThreshold: 24_000
    })

    const settings = loadSettings(settingsPath)
    expect(settings.models.observerModelOverride).toBe('bai/qwen3.8-flash')
    expect(settings.models.reflectorModelOverride).toBe('bai/qwen3.8-flash')
    expect(settings.models.omObservationThreshold).toBe(24_000)
  })

  it('rejects invalid updates without broadcasting or persisting', async () => {
    const defaultMock = mockSession()
    const broadcastState = vi.fn().mockResolvedValue(undefined)
    const om = createRuntimeOmService({
      controller,
      defaultSession: defaultMock.session,
      broadcastState
    })

    await expect(om.update({ observerModelId: 'gpt-5-mini' })).rejects.toThrow(/provider\/model/)
    await expect(om.update({ observationThreshold: 0 })).rejects.toThrow(/observationThreshold/)
    expect(broadcastState).not.toHaveBeenCalled()
    expect(defaultMock.session.state.set).not.toHaveBeenCalled()
  })

  it('getStatus falls back to persisted settings.json when session state is empty', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mingyi-om-fallback-'))
    tempDirs.push(directory)
    const settingsPath = join(directory, 'settings.json')
    const omInit = createRuntimeOmService({
      controller,
      defaultSession: mockSession().session,
      settingsPath
    })
    await omInit.update({
      observerModelId: 'bai/qwen3.8-flash',
      reflectorModelId: 'bai/qwen3.8-flash'
    })

    // 新的空 session（模拟重启后 state 尚未被覆盖时的读取）
    const freshOm = createRuntimeOmService({
      controller,
      defaultSession: mockSession().session,
      settingsPath
    })
    const status = freshOm.getStatus()
    expect(status.observerModelId).toBe('bai/qwen3.8-flash')
    expect(status.reflectorModelId).toBe('bai/qwen3.8-flash')
  })
})
