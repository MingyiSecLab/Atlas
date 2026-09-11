import type {
  AgentSchedule,
  AnySchedule,
  CreateAgentScheduleInput,
  CreateWorkflowScheduleInput,
  UpdateScheduleInput,
  WorkflowSchedule
} from '@mastra/core/schedules'
import type { ScheduleTrigger } from '@mastra/core/storage'

export type RuntimeSchedule = AnySchedule
export type RuntimeAgentSchedule = AgentSchedule
export type RuntimeWorkflowSchedule = WorkflowSchedule
export type RuntimeScheduleTrigger = ScheduleTrigger

export type CreateRuntimeScheduleInput = CreateAgentScheduleInput | CreateWorkflowScheduleInput
export type UpdateRuntimeScheduleInput = UpdateScheduleInput

export interface RuntimeAutomationService {
  list(filter?: { status?: 'active' | 'paused' }): Promise<RuntimeSchedule[]>
  get(id: string): Promise<RuntimeSchedule | null>
  create(input: CreateRuntimeScheduleInput): Promise<RuntimeSchedule>
  update(id: string, patch: UpdateRuntimeScheduleInput): Promise<RuntimeSchedule>
  pause(id: string): Promise<RuntimeSchedule>
  resume(id: string): Promise<RuntimeSchedule>
  run(id: string): Promise<{ scheduleId: string; claimId: string; scheduledFireAt: number }>
  delete(id: string): Promise<void>
  listTriggers(id: string, limit?: number): Promise<RuntimeScheduleTrigger[]>
}
