import { describe, expect, it, vi } from 'vitest'
import { createRuntimeAutomationService } from '../src/automations/service.js'

function createMock() {
  const schedules = {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'agent_daily', agentId: 'code-agent' }),
    update: vi.fn().mockResolvedValue({ id: 'agent_daily' }),
    pause: vi.fn().mockResolvedValue({ id: 'agent_daily', status: 'paused' }),
    resume: vi.fn().mockResolvedValue({ id: 'agent_daily', status: 'active' }),
    run: vi.fn().mockResolvedValue({ scheduleId: 'agent_daily', claimId: 'manual', scheduledFireAt: 1 }),
    delete: vi.fn().mockResolvedValue(undefined)
  }
  const storage = { getStore: vi.fn().mockResolvedValue({ listTriggers: vi.fn().mockResolvedValue([]) }) }
  return { mastra: { schedules, getStorage: () => storage } as never, schedules, storage }
}

describe('runtime automation service', () => {
  it('passes lifecycle operations through to Mastra', async () => {
    const mock = createMock()
    const service = createRuntimeAutomationService({ mastra: mock.mastra, resourceId: 'resource-1' })
    await service.create({ agentId: 'code-agent', cron: '@daily', prompt: 'check' })
    await service.list({ status: 'active' })
    await service.pause('agent_daily')
    await service.resume('agent_daily')
    await service.run('agent_daily')
    await service.delete('agent_daily')
    expect(mock.schedules.create).toHaveBeenCalledWith({ agentId: 'code-agent', cron: '@daily', prompt: 'check' })
    expect(mock.schedules.list).toHaveBeenCalledWith({ status: 'active' })
  })

  it('binds threaded schedules and rejects another resource', async () => {
    const mock = createMock()
    const service = createRuntimeAutomationService({ mastra: mock.mastra, resourceId: 'resource-1' })
    await service.create({ agentId: 'code-agent', cron: '@daily', prompt: 'check', threadId: 'thread-1' })
    expect(mock.schedules.create).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 'resource-1' }))
    await expect(service.create({ agentId: 'code-agent', cron: '@daily', prompt: 'check', threadId: 'thread-1', resourceId: 'other' })).rejects.toThrow('does not belong')
  })

  it('reads trigger history from the schedules storage domain', async () => {
    const mock = createMock()
    const service = createRuntimeAutomationService({ mastra: mock.mastra, resourceId: 'resource-1' })
    await service.listTriggers('agent_daily', 5)
    expect(mock.storage.getStore).toHaveBeenCalledWith('schedules')
  })
})
