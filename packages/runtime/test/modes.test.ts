import { describe, it, expect } from 'vitest'
import {
  allModes,
  defaultModes,
  customModes,
  pentestMode,
  auditMode,
  ATLAS_BRAND_PREAMBLE,
  createControllerConfig
} from '../src/index.js'

describe('modes configuration', () => {
  it('exports customModes containing pentest, audit', () => {
    const ids = customModes.map((m) => m.id)
    expect(ids).toEqual(['pentest', 'audit'])
  })

  it('exports defaultModes and allModes containing only custom modes', () => {
    const defaultIds = defaultModes.map((m) => m.id)
    const allIds = allModes.map((m) => m.id)
    expect(defaultIds).toEqual(['pentest', 'audit'])
    expect(allIds).toEqual(['pentest', 'audit'])
    expect(allIds).not.toContain('build')
    expect(allIds).not.toContain('plan')
    expect(allIds).not.toContain('fast')
  })

  it('injects ATLAS_BRAND_PREAMBLE into custom mode instructions', () => {
    expect(pentestMode.instructions).toContain(ATLAS_BRAND_PREAMBLE)
    expect(auditMode.instructions).toContain(ATLAS_BRAND_PREAMBLE)
  })

  it('exposes native task tools in every mode availableTools', () => {
    // code-sdk 系统提示词始终介绍 task_* 工具；availableTools 白名单若漏掉它们，
    // 模型调用会被 activeTools 隐藏并报 ToolNotFoundError
    const taskTools = ['task_write', 'task_update', 'task_complete', 'task_check']
    for (const mode of customModes) {
      for (const tool of taskTools) {
        expect(mode.availableTools).toContain(tool)
      }
    }
  })

  it('defaults controllerConfig.modes to allModes when not specified', () => {
    const config = createControllerConfig({
      workspacePath: '/tmp/test-workspace'
    })
    expect(config.modes).toBeDefined()
    const modeIds = config.modes?.map((m) => m.id)
    expect(modeIds).toEqual(['pentest', 'audit'])
    expect(modeIds).not.toContain('build')
  })
})
