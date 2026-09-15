import { describe, it, expect } from 'vitest'
import { MC_TOOLS, TOOL_NAME_OVERRIDES } from '@mastra/code-sdk/tool-names'
import {
  allModes,
  defaultModes,
  customModes,
  pentestMode,
  auditMode,
  ATLAS_BRAND_PREAMBLE,
  createControllerConfig,
  createSecurityMastraTools,
  type RuntimeSandboxAdapter
} from '../src/index.js'

/**
 * 控制器内置工具（工作区工具之外）：见 @mastra/core 的 `BuiltinToolId`，
 * 外加 code-sdk 追加的 workflow 查询工具与 notification_inbox。
 */
const CONTROLLER_BUILTIN_TOOLS = [
  'ask_user',
  'submit_plan',
  'subagent',
  'task_write',
  'task_update',
  'task_complete',
  'task_check',
  'notification_inbox',
  'list-workflows',
  'get-workflow'
]

/** 仅用于让适配层注册 kali_* 工具；守卫测试不会真的执行任何命令。 */
function stubSandbox(): RuntimeSandboxAdapter {
  return { id: 'stub-sandbox' } as unknown as RuntimeSandboxAdapter
}

/**
 * 模型侧真实可见的工具名全集。
 *
 * `availableTools` 的过滤是**对工具集 key 做精确字符串比对**
 * （@mastra/core `prepareToolsAndToolChoice` → `activeTools.includes(name)`），
 * 不做任何别名归一。因此白名单里写错名字不会报错，只会被静默过滤掉。
 * 工作区工具的真实名字来自 code-sdk 的 `TOOL_NAME_OVERRIDES` 重映射
 * （`mastra_workspace_read_file` → `view` 等），不是 `read` / `grep` / `bash`。
 */
function realToolNames(): Set<string> {
  return new Set([
    ...Object.values(TOOL_NAME_OVERRIDES).map((config) => config.name),
    ...Object.values(MC_TOOLS),
    ...CONTROLLER_BUILTIN_TOOLS,
    ...Object.keys(createSecurityMastraTools({ sandbox: stubSandbox() }))
  ])
}

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

  it('maps every whitelisted tool name onto a real exposed tool', () => {
    // availableTools 是精确名匹配，写错名字不会报错、只会被静默过滤。
    // 历史事故：白名单写了 read / grep / find / bash，而工作区工具的真实暴露名
    // 是 view / search_content / find_files / execute_command → 4 个条目从未生效。
    const real = realToolNames()
    for (const mode of customModes) {
      const dead = (mode.availableTools ?? []).filter((name) => !real.has(name))
      expect(dead, `mode "${mode.id}" 的 availableTools 含不存在的工具名`).toEqual([])
    }
  })

  it('keeps the code-sdk workspace tool rename we depend on', () => {
    // 上一条守卫的准确性依赖这张重映射表；SDK 改名会让它失准，这里锁住。
    const remapped = new Set(Object.values(TOOL_NAME_OVERRIDES).map((config) => config.name))
    for (const name of ['view', 'search_content', 'find_files', 'file_stat']) {
      expect(remapped.has(name), `code-sdk 不再把工作区工具暴露为 "${name}"`).toBe(true)
    }
  })

  it('exposes every security-domain tool in the pentest allowlist', () => {
    // 新增安全工具后忘记同步白名单 = 工具注册了但模型看不见
    const securityToolNames = Object.keys(createSecurityMastraTools({ sandbox: stubSandbox() }))
    expect(securityToolNames.length).toBe(17)
    for (const name of securityToolNames) {
      expect(pentestMode.availableTools).toContain(name)
    }
  })

  it('only references real Kali sandbox asset roots in the pentest prompt', () => {
    // 沙箱资产索引是模型「知道去哪检索」的唯一来源：路径写错或漏掉，离线知识库与
    // PoC 库就形同不存在（模型只能联网下载或凭记忆编造 Payload）。
    // 白名单里每一项均已在运行容器内实测存在；新增前请先 docker exec 确认。
    // 注意：不能用简单的 toContain 断言 —— 索引正文与示例命令里会出现同一个路径，
    // 其中一处写错时另一处仍能满足包含关系，检查会静默放过（已实测）。
    const KNOWN_SANDBOX_ROOTS = new Set(['workspace', 'knowledges', 'pocs', 'tools', '.local'])
    const referenced = new Set(
      [...pentestMode.instructions.matchAll(/\/home\/kali\/([A-Za-z0-9._-]+)/g)].map((m) => m[1])
    )

    const unknown = [...referenced].filter((name) => !KNOWN_SANDBOX_ROOTS.has(name))
    expect(unknown, 'pentest 提示词引用了未知的 /home/kali 路径').toEqual([])

    for (const required of ['workspace', 'knowledges', 'pocs', 'tools', '.local']) {
      expect(
        referenced.has(required),
        `pentest 提示词缺少沙箱资产根 /home/kali/${required}`
      ).toBe(true)
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
