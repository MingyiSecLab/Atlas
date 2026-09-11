import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const runtimeSource = join(import.meta.dirname, '..', 'src')

describe('standardized tool module layout', () => {
  it('keeps generic mechanisms and the security tool domain in the tools layer', () => {
    expect(existsSync(join(runtimeSource, 'tools', 'runtime-tools', 'executor.ts'))).toBe(true)
    expect(existsSync(join(runtimeSource, 'tools', 'security-tools', 'index.ts'))).toBe(true)
  })

  it('keeps pentest tool implementations inside the pentest domain', () => {
    expect(existsSync(join(runtimeSource, 'pentest', 'tools.ts'))).toBe(true)
    expect(existsSync(join(runtimeSource, 'pentest', 'builtin-tools.ts'))).toBe(true)
    expect(existsSync(join(runtimeSource, 'pentest', 'scope.ts'))).toBe(true)
    expect(existsSync(join(runtimeSource, 'pentest', 'destructive-guard.ts'))).toBe(true)
    expect(existsSync(join(runtimeSource, 'pentest', 'security-tools'))).toBe(false)
  })
})
