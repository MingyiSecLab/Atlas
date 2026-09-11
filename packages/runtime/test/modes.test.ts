import { describe, it, expect } from 'vitest'
import {
  allModes,
  defaultModes,
  customModes,
  createControllerConfig
} from '../src/index.js'

describe('modes configuration', () => {
  it('exports defaultModes containing build, plan, fast', () => {
    const ids = defaultModes.map((m) => m.id)
    expect(ids).toContain('build')
    expect(ids).toContain('plan')
    expect(ids).toContain('fast')
  })

  it('exports customModes containing pentest, audit', () => {
    const ids = customModes.map((m) => m.id)
    expect(ids).toEqual(['pentest', 'audit'])
  })

  it('exports allModes combining default and custom modes', () => {
    expect(allModes.length).toBe(defaultModes.length + customModes.length)
    const ids = allModes.map((m) => m.id)
    expect(ids).toEqual(['build', 'plan', 'fast', 'pentest', 'audit'])
  })

  it('defaults controllerConfig.modes to allModes when not specified', () => {
    const config = createControllerConfig({
      workspacePath: '/tmp/test-workspace'
    })
    expect(config.modes).toBeDefined()
    const modeIds = config.modes?.map((m) => m.id)
    expect(modeIds).toContain('build')
    expect(modeIds).toContain('pentest')
    expect(modeIds).toContain('audit')
  })
})
