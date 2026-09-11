import type { Mastra } from '@mastra/core/mastra'
import type { CreateAgentScheduleInput, CreateWorkflowScheduleInput } from '@mastra/core/schedules'
import type { RuntimeAutomationService, CreateRuntimeScheduleInput } from './types.js'

interface AutomationServiceOptions {
  mastra: Mastra | undefined
  resourceId: string
}

function requiredId(value: string): string {
  const id = value.trim()
  if (!id) throw new Error('Automation ID must not be empty.')
  return id
}

function ensureMastra(mastra: Mastra | undefined): Mastra {
  if (!mastra) throw new Error('Automation storage is unavailable.')
  return mastra
}

function withResourceId(
  input: CreateRuntimeScheduleInput,
  resourceId: string
): CreateRuntimeScheduleInput {
  if (!('agentId' in input) || !input.threadId) return input
  if (input.resourceId && input.resourceId !== resourceId) {
    throw new Error('Automation resource does not belong to this workspace.')
  }
  return { ...input, resourceId } as CreateAgentScheduleInput
}

export function createRuntimeAutomationService(
  options: AutomationServiceOptions
): RuntimeAutomationService {
  const getSchedules = () => ensureMastra(options.mastra).schedules

  return {
    list: (filter) => getSchedules().list(filter),
    get: (id) => getSchedules().get(requiredId(id)),
    create: async (input) => {
      const next = withResourceId(input, options.resourceId)
      return 'agentId' in next
        ? getSchedules().create(next as CreateAgentScheduleInput)
        : getSchedules().create(next as CreateWorkflowScheduleInput)
    },
    update: (id, patch) => getSchedules().update(requiredId(id), patch),
    pause: (id) => getSchedules().pause(requiredId(id)),
    resume: (id) => getSchedules().resume(requiredId(id)),
    run: (id) => getSchedules().run(requiredId(id)),
    delete: (id) => getSchedules().delete(requiredId(id)),
    listTriggers: async (id, limit = 20) => {
      const scheduleId = requiredId(id)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error('Trigger history limit must be an integer between 1 and 100.')
      }
      const storage = ensureMastra(options.mastra).getStorage()
      const schedules = await storage?.getStore('schedules')
      if (!schedules) throw new Error('Automation trigger history is unavailable.')
      return schedules.listTriggers(scheduleId, { limit })
    }
  }
}
