import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRuntimeAuditService } from '../src/audit/service.js'
import { FileAuditStore } from '../src/audit/store.js'
import { AuditRunError } from '../src/audit/types.js'

const CHECK = {
  agentId: 'audit-hunter',
  invariant: 'authz',
  method: 'source' as const,
  result: 'ok'
}
const TRACE = [
  { kind: 'entrypoint' as const, path: 'src/api.ts', line: 3, detail: 'input' },
  { kind: 'sink' as const, path: 'src/db.ts', line: 9, detail: 'query' }
]
const CONFIRMED = {
  fingerprint: 'src/db.ts::sqli',
  title: 'SQLi',
  verdict: 'confirmed' as const,
  severity: 'high' as const,
  rootCause: 'string concat',
  observedResult: '源码确立：拼接进 SQL',
  remediation: 'parameterize',
  trace: TRACE
}

const tempDirs: string[] = []
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function newRun(sessionId?: string) {
  const service = createRuntimeAuditService()
  const run = service.create({
    repo: 'atlas',
    target: '/tmp/repo',
    ...(sessionId ? { sessionId } : {})
  })
  return { service, run }
}

describe('runtime audit service', () => {
  it('creates a run with in_progress recon defaults', () => {
    const { run } = newRun()
    const snap = run.snapshot()
    expect(snap.repo).toBe('atlas')
    expect(snap.phase).toBe('recon')
    expect(snap.runStatus).toBe('in_progress')
    expect(snap.units).toEqual([])
  })

  it('seeds unique units, rejects duplicates and invalid seeds, emits one run event', () => {
    const { service, run } = newRun()
    const events: string[] = []
    service.subscribe((event) => events.push(event.type))
    const first = run.seedUnits([
      { coverageId: 'a::b::c::d', subsystem: 'api' },
      { coverageId: 'a::b::c::d', subsystem: 'api' },
      { coverageId: 'bad-covered', status: 'covered' },
      { coverageId: 'deferred-no-reason', status: 'deferred' }
    ])
    expect(first.seeded).toBe(1)
    expect(first.rejected).toEqual(['a::b::c::d', 'bad-covered', 'deferred-no-reason'])
    expect(events).toEqual(['run_updated'])
  })

  it('enforces owner rules and closure evidence', () => {
    const { run } = newRun()
    run.seedUnits([{ coverageId: 'u1' }])

    expect(() => run.updateUnit('u1', { status: 'covered' })).toThrow(/owner/)
    expect(() => run.updateUnit('u1', { status: 'covered', agentId: 'audit-hunter' })).toThrow(
      /reviewedPaths and checks/
    )
    run.updateUnit('u1', {
      status: 'covered',
      agentId: 'audit-hunter',
      reviewedPaths: ['src/api.ts'],
      checks: [CHECK]
    })
    expect(run.snapshot().units[0]?.status).toBe('covered')

    expect(() => run.updateUnit('u1', { status: 'candidate' })).toThrow(/not allowed/)
  })

  it('releases the owner automatically when a unit is deferred', () => {
    const { run } = newRun()
    run.seedUnits([{ coverageId: 'u1' }])
    run.updateUnit('u1', { status: 'in_progress', agentId: 'audit-hunter' })
    expect(() =>
      run.updateUnit('u1', { status: 'deferred', agentId: 'audit-hunter', reason: 'budget' })
    ).toThrow(AuditRunError)
    expect(() => run.updateUnit('u1', { status: 'deferred' })).toThrow(/reason/)
    run.updateUnit('u1', { status: 'deferred', reason: 'budget' })
    expect(run.snapshot().units[0]).toMatchObject({ status: 'deferred', agentId: null })
  })

  it('rejects backward transitions from closed units', () => {
    const { run } = newRun()
    run.seedUnits([{ coverageId: 'u1' }])
    run.updateUnit('u1', {
      status: 'covered',
      agentId: 'h',
      reviewedPaths: ['a.ts'],
      checks: [CHECK]
    })
    expect(() => run.updateUnit('u1', { status: 'planned' })).toThrow(/covered → planned/)
    run.updateUnit('u1', { status: 'in_progress', agentId: 'h2' })
    expect(run.snapshot().units[0]?.agentId).toBe('h2')
  })

  it('validates verdict contracts', () => {
    const { run } = newRun()
    expect(() =>
      run.recordFinding({ fingerprint: 'fp-1', title: 'x', verdict: 'confirmed', severity: 'high' })
    ).toThrow(/rootCause, observedResult, remediation/)
    expect(() =>
      run.recordFinding({ fingerprint: 'fp-2', title: 'y', verdict: 'needs_validation' })
    ).toThrow(/blocker/)
    expect(() =>
      run.recordFinding({
        fingerprint: 'fp-2',
        title: 'y',
        verdict: 'needs_validation',
        blockers: ['b']
      })
    ).toThrow(/validationPlan/)
    expect(() =>
      run.recordFinding({
        fingerprint: 'has space:12',
        title: 'z',
        verdict: 'rejected',
        rejectionReason: 'r'
      })
    ).toThrow(/Fingerprint/)
    expect(() =>
      run.recordFinding({
        ...CONFIRMED,
        trace: [
          { kind: 'sink', path: 'src/db.ts', detail: 'x' },
          { kind: 'entrypoint', path: 'src/api.ts', detail: 'y' }
        ]
      })
    ).toThrow(/entrypoint/)
    expect(() =>
      run.recordFinding({
        ...CONFIRMED,
        trace: [{ kind: 'sink', path: '/etc/passwd', detail: 'x' }]
      })
    ).toThrow(/repository-relative/)
  })

  it('replaces the whole record on re-record so verdict-specific fields do not linger', () => {
    const { run } = newRun()
    const a = run.recordFinding(CONFIRMED)
    const b = run.recordFinding({
      fingerprint: CONFIRMED.fingerprint,
      title: 'SQLi (refuted)',
      verdict: 'rejected',
      rejectionReason: 'value is an enum'
    })
    expect(b.id).toBe(a.id)
    const findings = run.snapshot().findings
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ verdict: 'rejected', title: 'SQLi (refuted)' })
    expect(findings[0]?.severity).toBeUndefined()
    expect(findings[0]?.remediation).toBeUndefined()
  })

  it('refuses complete while the ledger has open units or unrecorded candidates', () => {
    const { run } = newRun()
    expect(() => run.setRunStatus('complete')).toThrow(/ledger is empty/)
    run.seedUnits([{ coverageId: 'u1' }, { coverageId: 'u2' }])
    expect(() => run.setRunStatus('complete')).toThrow(/planned\/in_progress/)
    run.updateUnit('u1', {
      status: 'candidate',
      agentId: 'h',
      fingerprints: [CONFIRMED.fingerprint]
    })
    run.updateUnit('u2', { status: 'not_applicable', reason: 'no uploads' })
    expect(() => run.setRunStatus('complete')).toThrow(/without a final record/)
    run.recordFinding(CONFIRMED)
    run.setRunStatus('complete')
    expect(run.snapshot().runStatus).toBe('complete')
  })

  it('makes terminal runs read-only and requires an incomplete reason', () => {
    const { service, run } = newRun()
    const events: string[] = []
    service.subscribe((event) => events.push(event.type))
    expect(() => run.setRunStatus('incomplete')).toThrow(/incompleteReason/)
    run.setRunStatus('incomplete', 'validation_budget_exhausted')
    expect(run.snapshot()).toMatchObject({
      runStatus: 'incomplete',
      incompleteReason: 'validation_budget_exhausted'
    })
    expect(events).toContain('status_changed')
    expect(() => run.setPhase('reporting')).toThrow(/already incomplete/)
    expect(() => run.seedUnits([{ coverageId: 'late' }])).toThrow(AuditRunError)
  })

  it('resolves the active run per session and never returns terminal runs', () => {
    const service = createRuntimeAuditService()
    const a = service.create({ repo: 'a', target: '/a', sessionId: 's1' })
    const b = service.create({ repo: 'b', target: '/b', sessionId: 's2' })
    expect(service.active('s1')?.id).toBe(a.id)
    expect(service.active('s2')?.id).toBe(b.id)
    expect(service.active('s3')).toBeUndefined()
    b.setRunStatus('incomplete', 'stopped')
    expect(service.active('s2')).toBeUndefined()
    expect(service.active()?.id).toBe(a.id)
  })

  it('persists bursts of changes without tmp-file races and reloads the latest state', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-audit-'))
    tempDirs.push(dir)
    const service = createRuntimeAuditService({ store: new FileAuditStore({ directory: dir }) })
    await service.ready
    const run = service.create({ repo: 'atlas', target: '/tmp/repo' })
    run.seedUnits(Array.from({ length: 40 }, (_, i) => ({ coverageId: `u${i}` })))
    for (let i = 0; i < 40; i += 1) {
      run.updateUnit(`u${i}`, { status: 'in_progress', agentId: 'audit-hunter' })
    }
    await service.flush()

    expect(readdirSync(dir)).toEqual([`${run.id}.json`])
    const onDisk = JSON.parse(readFileSync(join(dir, `${run.id}.json`), 'utf8'))
    expect(onDisk.units.every((unit: { status: string }) => unit.status === 'in_progress')).toBe(
      true
    )

    const reloaded = createRuntimeAuditService({ store: new FileAuditStore({ directory: dir }) })
    await reloaded.ready
    expect(reloaded.get(run.id)?.snapshot().units).toHaveLength(40)
  })
})
