import { describe, expect, it } from 'vitest'
import { createRuntimeAuditService } from '../src/audit/service.js'
import { AuditRunError } from '../src/audit/types.js'

describe('runtime audit service', () => {
  it('creates a run with in_progress recon defaults', () => {
    const service = createRuntimeAuditService()
    const run = service.create({ repo: 'atlas', target: '/tmp/repo' })
    const snap = run.snapshot()
    expect(snap.repo).toBe('atlas')
    expect(snap.phase).toBe('recon')
    expect(snap.runStatus).toBe('in_progress')
    expect(snap.units).toEqual([])
  })

  it('seeds unique units and rejects duplicate coverage ids', () => {
    const service = createRuntimeAuditService()
    const run = service.create({ repo: 'atlas', target: '/tmp/repo' })
    const first = run.seedUnits([
      { coverageId: 'a::b::c::d', subsystem: 'api' },
      { coverageId: 'a::b::c::d', subsystem: 'api' }
    ])
    expect(first.seeded).toBe(1)
    expect(first.rejected).toEqual(['a::b::c::d'])
  })

  it('enforces the unit state machine owner rules', () => {
    const service = createRuntimeAuditService()
    const run = service.create({ repo: 'atlas', target: '/tmp/repo' })
    run.seedUnits([{ coverageId: 'u1' }])

    // covered 必须携带归属
    expect(() => run.updateUnit('u1', { status: 'covered' })).toThrow(AuditRunError)
    run.updateUnit('u1', { status: 'covered', agentId: 'audit-hunter' })
    expect(run.snapshot().units[0]?.status).toBe('covered')

    // deferred 不得携带归属
    expect(() =>
      run.updateUnit('u1', { status: 'deferred', agentId: 'audit-hunter' })
    ).toThrow(AuditRunError)
  })

  it('dedupes findings by fingerprint and validates verdict contracts', () => {
    const service = createRuntimeAuditService()
    const run = service.create({ repo: 'atlas', target: '/tmp/repo' })

    expect(() =>
      run.recordFinding({ fingerprint: 'fp-1', title: 'x', verdict: 'confirmed' })
    ).toThrow(/severity/)

    const a = run.recordFinding({
      fingerprint: 'fp-1',
      title: 'SQLi',
      verdict: 'confirmed',
      severity: 'high'
    })
    const b = run.recordFinding({
      fingerprint: 'fp-1',
      title: 'SQLi (corrected)',
      verdict: 'confirmed',
      severity: 'high'
    })
    expect(b.id).toBe(a.id)
    expect(run.snapshot().findings).toHaveLength(1)
    expect(run.snapshot().findings[0]?.title).toBe('SQLi (corrected)')

    expect(() =>
      run.recordFinding({ fingerprint: 'fp-2', title: 'y', verdict: 'needs_validation' })
    ).toThrow(/blocker/)
  })

  it('records incomplete status with a reason and emits events', () => {
    const service = createRuntimeAuditService()
    const events: string[] = []
    service.subscribe((event) => events.push(event.type))
    const run = service.create({ repo: 'atlas', target: '/tmp/repo' })
    run.setRunStatus('incomplete', 'validation_budget_exhausted')
    const snap = run.snapshot()
    expect(snap.runStatus).toBe('incomplete')
    expect(snap.incompleteReason).toBe('validation_budget_exhausted')
    expect(events).toContain('run_created')
    expect(events).toContain('status_changed')
  })
})
