import { expect, test } from '@playwright/test'
import {
  createOptimisticSkillMessage,
  createOptimisticUserMessage,
  mergeTimelineMessage
} from '../src/renderer/src/state/chat-timeline'
import type { ChatMessage } from '../src/renderer/src/components/chat/types'
import { parseSkillActivation } from '../src/renderer/src/components/chat/skills/skill-activation'

test('shows a submitted user message immediately and replaces it with the persisted message', () => {
  const optimistic = createOptimisticUserMessage(
    '这条用户消息应立即展示',
    [],
    new Date('2026-08-19T08:00:00.000Z'),
    'test-message'
  )
  const persisted: ChatMessage = {
    id: 'persisted-message',
    role: 'user',
    blocks: [{ type: 'text', text: '这条用户消息应立即展示' }],
    timestamp: '16:00'
  }

  const submitted = mergeTimelineMessage([], optimistic)
  expect(submitted).toEqual([optimistic])

  const reconciled = mergeTimelineMessage(submitted, persisted)
  expect(reconciled).toEqual([persisted])
})

test('shows a Skill invocation immediately and reconciles its persisted envelope', () => {
  const optimistic = createOptimisticSkillMessage(
    'security-audit',
    '检查 OAuth',
    [],
    new Date('2026-08-19T08:00:00.000Z'),
    'test-skill'
  )
  const activation = parseSkillActivation(
    '<skill name="security-audit">\n# Security audit\n\nARGUMENTS: 检查 OAuth\n</skill>'
  )
  expect(activation).toEqual({
    type: 'skill',
    name: 'security-audit',
    instructions: '# Security audit',
    arguments: '检查 OAuth'
  })

  const persisted: ChatMessage = {
    id: 'persisted-skill',
    role: 'user',
    blocks: [activation!],
    timestamp: '16:00'
  }
  expect(mergeTimelineMessage([optimistic], persisted)).toEqual([persisted])
})
