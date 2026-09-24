import { describe, expect, it } from 'vitest'
import { allSubagents, builtinSubagents, customSubagents } from '../src/mastra/subagents/index.js'

describe('subagent 目录装配', () => {
  it('保留 SDK 内置三个并追加自定义五个', () => {
    expect(builtinSubagents.map((subagent) => subagent.id)).toEqual(['explore', 'plan', 'execute'])
    expect(customSubagents).toHaveLength(5)
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
})
