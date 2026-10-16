import { MC_TOOLS } from '@mastra/code-sdk/tool-names'
import { describe, expect, it } from 'vitest'
import {
  allSubagents,
  auditSubagents,
  builtinSubagents,
  customSubagents,
  docWriterSubagent,
  perfOptimizerSubagent,
  refactorAssistantSubagent,
  securityAuditorSubagent,
  testGeneratorSubagent
} from '../src/mastra/subagents/index.js'

const workspaceToolNames = new Set<string>(Object.values(MC_TOOLS))
const readOnlyTools = [
  MC_TOOLS.VIEW,
  MC_TOOLS.SEARCH_CONTENT,
  MC_TOOLS.FIND_FILES,
  MC_TOOLS.FILE_STAT
]

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

  // @mastra/core 只按 allowedWorkspaceTools 过滤 workspace 工具；写在 allowedControllerTools
  // 里的 workspace 名会被静默忽略，subagent 因此拿到全部工具（含 write_file / execute_command）。
  // TODO: audit subagents 的同类修复合入后，把 auditSubagents 也纳入这两条断言。
  const generalSubagents = customSubagents.filter((subagent) => !auditSubagents.includes(subagent))

  it('通用自定义 subagent 的 allowedWorkspaceTools 都是真实的 MC_TOOLS 名', () => {
    expect(generalSubagents).toHaveLength(5)
    for (const subagent of generalSubagents) {
      expect(subagent.allowedWorkspaceTools?.length, subagent.id).toBeGreaterThan(0)
      for (const tool of subagent.allowedWorkspaceTools ?? []) {
        expect(workspaceToolNames.has(tool), `${subagent.id}: ${tool}`).toBe(true)
      }
    }
  })

  it('通用自定义 subagent 不把 workspace 工具名写进 allowedControllerTools', () => {
    for (const subagent of generalSubagents) {
      for (const tool of subagent.allowedControllerTools ?? []) {
        expect(workspaceToolNames.has(tool), `${subagent.id}: ${tool}`).toBe(false)
      }
    }
  })

  it('工具集合与各 subagent 职责一致', () => {
    const tools = (subagent: { allowedWorkspaceTools?: string[] }) =>
      [...(subagent.allowedWorkspaceTools ?? [])].sort()
    const writeTools = [...readOnlyTools, MC_TOOLS.WRITE_FILE, MC_TOOLS.STRING_REPLACE_LSP]
    const execTools = [...writeTools, MC_TOOLS.EXECUTE_COMMAND]

    expect(tools(securityAuditorSubagent)).toEqual([...readOnlyTools].sort())
    expect(tools(refactorAssistantSubagent)).toEqual([...writeTools].sort())
    expect(tools(docWriterSubagent)).toEqual([...writeTools].sort())
    expect(tools(perfOptimizerSubagent)).toEqual([...execTools].sort())
    expect(tools(testGeneratorSubagent)).toEqual([...execTools].sort())
  })
})
