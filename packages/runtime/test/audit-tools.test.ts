import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAuditMastraTools } from '../src/audit/mastra-tools.js'
import { createRuntimeAuditService } from '../src/audit/service.js'

let target: string

beforeAll(() => {
  target = mkdtempSync(join(tmpdir(), 'atlas-audit-target-'))
  mkdirSync(join(target, 'src'))
  writeFileSync(join(target, 'src/api.ts'), 'a\nb\nc\nd\ne\n')
  writeFileSync(join(target, 'src/db.ts'), Array.from({ length: 10 }, () => 'x').join('\n'))
})

afterAll(() => {
  rmSync(target, { recursive: true, force: true })
})

/** 模拟 Mastra 工具执行上下文中的会话信息。 */
function sessionContext(sessionId: string) {
  return { requestContext: { get: (key: string) => (key === 'sessionId' ? sessionId : undefined) } }
}

async function call(
  tools: ReturnType<typeof createAuditMastraTools>,
  name: keyof ReturnType<typeof createAuditMastraTools>,
  input: Record<string, unknown>,
  sessionId = 's1'
): Promise<Record<string, any>> {
  const tool = tools[name] as unknown as {
    execute: (input: unknown, context: unknown) => Promise<string>
  }
  return JSON.parse(await tool.execute(input, sessionContext(sessionId)))
}

const confirmed = (trace: unknown[]) => ({
  fingerprint: 'src/db.ts::sqli',
  title: 'SQLi',
  verdict: 'confirmed',
  severity: 'high',
  rootCause: 'concat',
  observedResult: '源码确立：拼接',
  remediation: 'parameterize',
  trace
})

describe('audit mastra tools', () => {
  it('binds runs to the calling session so concurrent audits do not cross-write', async () => {
    const service = createRuntimeAuditService()
    const tools = createAuditMastraTools({ auditService: service })
    const a = await call(tools, 'init_audit_run', { repo: 'a', target }, 's1')
    const b = await call(tools, 'init_audit_run', { repo: 'b', target }, 's2')

    await call(
      tools,
      'update_audit_ledger',
      { mode: 'seed', units: [{ coverageId: 'only-a' }] },
      's1'
    )
    expect(service.get(a.runId)?.snapshot().units).toHaveLength(1)
    expect(service.get(b.runId)?.snapshot().units).toHaveLength(0)

    const foreign = await call(tools, 'set_audit_phase', { runId: a.runId, phase: 'hunting' }, 's2')
    expect(foreign.success).toBe(false)
    expect(foreign.error).toMatch(/其他会话/)

    const none = await call(tools, 'set_audit_phase', { phase: 'hunting' }, 's3')
    expect(none.success).toBe(false)
  })

  it('can release an owner and record checks through the ledger tool', async () => {
    const service = createRuntimeAuditService()
    const tools = createAuditMastraTools({ auditService: service })
    const init = await call(tools, 'init_audit_run', { repo: 'a', target })
    await call(tools, 'update_audit_ledger', {
      mode: 'seed',
      units: [{ coverageId: 'u1' }, { coverageId: 'u2' }]
    })
    const res = await call(tools, 'update_audit_ledger', {
      mode: 'update',
      units: [
        {
          coverageId: 'u1',
          status: 'covered',
          agentId: 'audit-hunter',
          reviewedPaths: ['src/api.ts'],
          checks: [{ agentId: 'audit-hunter', invariant: 'authz', method: 'source', result: 'ok' }]
        },
        { coverageId: 'u2', status: 'in_progress', agentId: 'audit-hunter' }
      ]
    })
    expect(res.success).toBe(true)
    const release = await call(tools, 'update_audit_ledger', {
      mode: 'update',
      units: [{ coverageId: 'u2', status: 'deferred', agentId: null, reason: 'budget' }]
    })
    expect(release.success).toBe(true)
    const units = service.get(init.runId)!.snapshot().units
    expect(units[0]?.checks).toHaveLength(1)
    expect(units[1]).toMatchObject({ status: 'deferred', agentId: null })
  })

  it('rejects confirmed findings whose trace points at missing files or lines', async () => {
    const service = createRuntimeAuditService()
    const tools = createAuditMastraTools({ auditService: service })
    await call(tools, 'init_audit_run', { repo: 'a', target })

    const missingFile = await call(
      tools,
      'record_audit_finding',
      confirmed([
        { kind: 'entrypoint', path: 'src/api.ts', line: 2, detail: 'in' },
        { kind: 'sink', path: 'src/ghost.ts', line: 1, detail: 'out' }
      ])
    )
    expect(missingFile.success).toBe(false)
    expect(missingFile.error).toMatch(/src\/ghost\.ts/)

    const pastEnd = await call(
      tools,
      'record_audit_finding',
      confirmed([
        { kind: 'entrypoint', path: 'src/api.ts', line: 2, detail: 'in' },
        { kind: 'sink', path: 'src/db.ts', line: 99, detail: 'out' }
      ])
    )
    expect(pastEnd.success).toBe(false)
    expect(pastEnd.error).toMatch(/beyond end of file/)

    const ok = await call(
      tools,
      'record_audit_finding',
      confirmed([
        { kind: 'entrypoint', path: 'src/api.ts', line: 2, detail: 'in' },
        { kind: 'sink', path: 'src/db.ts', line: 9, detail: 'out' }
      ])
    )
    expect(ok.success).toBe(true)
  })

  it('surfaces the completion gate to the orchestrator', async () => {
    const service = createRuntimeAuditService()
    const tools = createAuditMastraTools({ auditService: service })
    await call(tools, 'init_audit_run', { repo: 'a', target })
    await call(tools, 'update_audit_ledger', { mode: 'seed', units: [{ coverageId: 'u1' }] })
    const res = await call(tools, 'set_audit_run_status', { runStatus: 'complete' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/planned\/in_progress/)
  })
})
