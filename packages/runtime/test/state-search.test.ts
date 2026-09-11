import { describe, expect, it, vi } from 'vitest'
import { createRuntimeStateSearchService } from '../src/state-search/index.js'

function createProject() {
  return createRuntimeStateSearchService().create({
    title: 'Authorized review',
    origin: 'repository checkout',
    goal: 'all findings have remediation guidance',
    authorization: {
      principal: 'security-team',
      scope: ['workspace://repo'],
      authorizationRef: 'ENG-1234'
    },
    intentLeaseMs: 100,
    reasonLeaseMs: 100
  })
}

describe('runtime state-space search', () => {
  it('keeps an auditable blackboard and deduplicates open intents', () => {
    const project = createProject()
    const events: string[] = []
    project.subscribe((event) => events.push(event.type))
    const originIntent = project.createIntent({
      from: ['origin'],
      description: 'inspect application boundaries',
      creator: 'agent-a'
    })
    const duplicate = project.createIntent({
      from: ['origin'],
      description: 'inspect application boundaries',
      creator: 'agent-a'
    })
    expect(duplicate.id).toBe(originIntent.id)
    const result = project.concludeIntent(originIntent.id, 'agent-a', 'boundary inventory recorded')
    expect(result.fact.sourceIntentId).toBe(originIntent.id)
    expect(project.snapshot().facts.map((fact) => fact.id)).toEqual(['origin', 'goal', 'f001'])
    expect(events).toEqual(['intent_created', 'intent_concluded', 'fact_added'])
  })

  it('enforces claims, lease expiry, stop state, and authorization expiry', () => {
    const project = createProject()
    const intent = project.createIntent({
      from: ['origin'],
      description: 'review config',
      creator: 'agent-a'
    })
    project.claimIntent(intent.id, 'agent-a', 1_000)
    expect(() => project.claimIntent(intent.id, 'agent-b', 1_050)).toThrow('currently claimed')
    project.claimIntent(intent.id, 'agent-b', 1_101)
    project.stop()
    expect(() =>
      project.createIntent({ from: ['origin'], description: 'blocked', creator: 'agent-a' })
    ).toThrow('stopped')
    project.resume()
    expect(project.snapshot().intents[0]?.worker).toBeUndefined()
  })

  it('rejects expired authorization before accepting exploration writes', () => {
    expect(() =>
      createRuntimeStateSearchService().create({
        title: 'Expired review',
        origin: 'workspace://repo',
        goal: 'stop',
        authorization: {
          principal: 'security-team',
          scope: ['workspace://repo'],
          authorizationRef: 'ENG-1234',
          expiresAt: Date.now() - 1
        }
      })
    ).toThrow('Authorization has expired')
  })

  it('runs bounded reason and explore callbacks without executing tools itself', async () => {
    const project = createProject()
    const reason = vi.fn(async () => ({
      type: 'intents' as const,
      intents: [{ from: ['origin'], description: 'collect read-only evidence' }]
    }))
    const explore = vi.fn(async () => ({
      type: 'fact' as const,
      description: 'evidence collected'
    }))
    const snapshot = await project.run({ worker: 'agent-a', maxSteps: 1, reason, explore })
    expect(reason).toHaveBeenCalledTimes(1)
    expect(explore).toHaveBeenCalledTimes(1)
    expect(snapshot.facts.some((fact) => fact.description === 'evidence collected')).toBe(true)
  })

  it('records completion as a distinct goal edge with the completing worker', () => {
    const project = createProject()
    const factIntent = project.createIntent({
      from: ['origin'],
      description: 'prepare evidence',
      creator: 'agent-a'
    })
    const { fact } = project.concludeIntent(factIntent.id, 'agent-a', 'evidence is ready')
    const completion = project.complete([fact.id], 'goal criteria verified', 'agent-b')
    expect(completion.to).toBe('goal')
    expect(completion.worker).toBe('agent-b')
    expect(project.snapshot().status).toBe('completed')
  })
})
