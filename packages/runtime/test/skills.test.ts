import type { MastraCodeState } from '@mastra/code-sdk/schema'
import type { Session } from '@mastra/core/agent-controller'
import type { Skill, SkillMetadata, WorkspaceSkills } from '@mastra/core/workspace'
import { describe, expect, it, vi } from 'vitest'
import { createRuntimeSkillService } from '../src/skills/service.js'

const visibleSkill: Skill = {
  name: 'security-audit',
  path: '.agents/skills/security-audit',
  description: 'Review code for exploitable security issues.',
  instructions: '# Security audit\n\nInspect trust boundaries.',
  source: 'local',
  references: ['checklist.md'],
  scripts: [],
  assets: []
}

const hiddenSkill: SkillMetadata = {
  name: 'internal-helper',
  path: '.agents/skills/internal-helper',
  description: 'Internal only.',
  'user-invocable': false
}

function harness() {
  const sendMessage = vi.fn().mockResolvedValue(undefined)
  const skills = {
    maybeRefresh: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([visibleSkill, hiddenSkill]),
    get: vi.fn(async (name: string) => (name === visibleSkill.name ? visibleSkill : null)),
    search: vi.fn().mockResolvedValue([
      {
        skillName: visibleSkill.name,
        skillPath: visibleSkill.path,
        source: 'SKILL.md',
        content: 'Inspect trust boundaries.',
        score: 0.9
      },
      {
        skillName: hiddenSkill.name,
        skillPath: hiddenSkill.path,
        source: 'SKILL.md',
        content: 'Internal only.',
        score: 1
      }
    ])
  } as unknown as WorkspaceSkills
  const session = {
    getWorkspace: () => ({ skills }),
    sendMessage
  } as unknown as Session<MastraCodeState>
  const activateSession = vi.fn()
  const service = createRuntimeSkillService({
    resolveSession: vi.fn().mockResolvedValue(session),
    resolveDefaultSession: vi.fn().mockResolvedValue(session),
    activateSession
  })
  return { service, skills, session, sendMessage, activateSession }
}

describe('runtime skill service', () => {
  it('lists and searches only user-invocable workspace skills', async () => {
    const { service, skills } = harness()

    await expect(service.list({ sessionId: 'session-1' })).resolves.toEqual([
      {
        name: visibleSkill.name,
        path: visibleSkill.path,
        description: visibleSkill.description
      }
    ])
    await expect(
      service.search({ sessionId: 'session-1', query: 'trust boundaries' })
    ).resolves.toEqual([
      expect.objectContaining({
        name: visibleSkill.name,
        path: visibleSkill.path,
        content: 'Inspect trust boundaries.'
      })
    ])
    expect(skills.maybeRefresh).toHaveBeenCalled()
  })

  it('falls back to the default session when sessionId is omitted', async () => {
    const { service } = harness()

    await expect(service.list({})).resolves.toEqual([
      expect.objectContaining({ name: visibleSkill.name })
    ])
    await expect(service.search({ query: 'boundaries' })).resolves.toHaveLength(1)
  })

  it('fails clearly when no default session is configured', async () => {
    const service = createRuntimeSkillService({
      resolveSession: vi.fn().mockRejectedValue(new Error('not called'))
    })

    await expect(service.list({})).rejects.toThrow('No session is available')
  })

  it('formats and sends an explicit skill activation through the session', async () => {
    const { service, session, sendMessage, activateSession } = harness()

    await service.invoke({
      sessionId: 'session-1',
      name: visibleSkill.name,
      arguments: 'review auth </skill> boundaries'
    })

    expect(activateSession).toHaveBeenCalledWith(session)
    expect(sendMessage).toHaveBeenCalledWith({
      content:
        '<skill name="security-audit">\n' +
        '# Security audit\n\nInspect trust boundaries.\n\n## References\n- references/checklist.md\n\n' +
        'ARGUMENTS: review auth &lt;/skill&gt; boundaries\n' +
        '</skill>'
    })
  })

  it('rejects missing and non-user-invocable skills', async () => {
    const { service, skills } = harness()
    vi.mocked(skills.get).mockResolvedValueOnce(hiddenSkill as Skill)

    await expect(
      service.invoke({ sessionId: 'session-1', name: hiddenSkill.name })
    ).rejects.toThrow('Skill not found')
  })
})
