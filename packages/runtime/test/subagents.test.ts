import { describe, expect, it } from 'vitest'
import { MC_TOOLS } from '@mastra/code-sdk/tool-names'
import {
  allSubagents,
  auditSubagents,
  builtinSubagents,
  customSubagents
} from '../src/mastra/subagents/index.js'

describe('subagent 目录装配', () => {
  it('保留 SDK 内置三个并追加自定义十个', () => {
    expect(builtinSubagents.map((subagent) => subagent.id)).toEqual(['explore', 'plan', 'execute'])
    expect(customSubagents).toHaveLength(10)
    expect(allSubagents).toHaveLength(builtinSubagents.length + customSubagents.length)

    // SDK 的 config.subagents 是整体替换语义，内置必须在前、自定义追加在后，
    // 否则调用方误传 customSubagents 会静默丢掉 explore/plan/execute。
    expect(allSubagents.slice(0, builtinSubagents.length)).toEqual(builtinSubagents)
    expect(allSubagents.slice(builtinSubagents.length)).toEqual(customSubagents)
  })

  it('id 全局唯一（SDK 按 id 派发）', () => {
    const ids = allSubagents.map((subagent) => subagent.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('每个 subagent 都有 id / name / description 供 UI 展示', () => {
    for (const subagent of allSubagents) {
      expect(subagent.id).toBeTruthy()
      expect(subagent.name).toBeTruthy()
      expect(subagent.description).toBeTruthy()
    }
  })

  it('audit subagents 用 allowedWorkspaceTools 收窄工作区工具', () => {
    // SDK 只按 allowedWorkspaceTools 过滤工作区工具；allowedControllerTools 写
    // view 等名字既不生效也不限制，subagent 会拿到 write_file / execute_command。
    const readOnly = new Set<string>([
      MC_TOOLS.VIEW,
      MC_TOOLS.SEARCH_CONTENT,
      MC_TOOLS.FIND_FILES,
      MC_TOOLS.FILE_STAT
    ])
    for (const subagent of auditSubagents) {
      const tools = subagent.allowedWorkspaceTools
      expect(tools, `${subagent.id} 缺少 allowedWorkspaceTools`).toBeDefined()
      expect(subagent.allowedControllerTools).toBeUndefined()
      const extra = (tools ?? []).filter((name) => !readOnly.has(name))
      if (subagent.id === 'audit-report-writer') {
        expect(extra.sort()).toEqual([MC_TOOLS.MKDIR, MC_TOOLS.WRITE_FILE].sort())
      } else {
        expect(extra, `${subagent.id} 应只读`).toEqual([])
      }
      expect(tools).not.toContain(MC_TOOLS.EXECUTE_COMMAND)
    }
  })
})
