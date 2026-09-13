import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createControllerConfig,
  createRuntimeExpertService,
  expertToMode,
  expertsDirectory,
  parseExpertFile,
  scanExpertModes,
  serializeExpertDefinition
} from '../src/index.js'

const directories: string[] = []

function tempWorkspace(): string {
  const directory = mkdtempSync(join(tmpdir(), 'experts-'))
  directories.push(directory)
  return directory
}

function writeExpert(workspace: string, fileName: string, content: string): void {
  mkdirSync(join(workspace, '.mastracode', 'agents'), { recursive: true })
  writeFileSync(join(workspace, '.mastracode', 'agents', fileName), content, 'utf8')
}

const VALID_EXPERT = `---
name: 安全合规审计师
description: 排查代码中的安全漏洞、注入风险与敏感信息泄露隐患。
model: anthropic/claude-sonnet-4-6
tools:
  - view
  - find_files
skills:
  - security-audit
tags:
  - 安全审计
icon: ShieldCheck
suggestedPrompts:
  - 检查这段 IPC 代码是否存在注入风险
---

你是一名应用安全审计专家，专注于代码安全审查。
`

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('expert file scanner', () => {
  it('parses a valid expert file into a definition and an AgentControllerMode', () => {
    const workspace = tempWorkspace()
    const scan = scanExpertModes({ workspacePath: workspace, configDirName: '.mastracode' })
    expect(scan.experts).toEqual([])

    writeExpert(workspace, 'security-auditor.md', VALID_EXPERT)
    const result = scanExpertModes({ workspacePath: workspace, configDirName: '.mastracode' })
    expect(result.warnings).toEqual([])
    expect(result.experts).toHaveLength(1)
    const expert = result.experts[0]!
    expect(expert.id).toBe('expert:security-auditor')
    expect(expert.slug).toBe('security-auditor')
    expect(expert.name).toBe('安全合规审计师')
    expect(expert.instructions).toContain('应用安全审计专家')
    expect(expert.tools).toEqual(['view', 'find_files'])
    expect(expert.model).toBe('anthropic/claude-sonnet-4-6')

    expect(result.modes).toHaveLength(1)
    const mode = result.modes[0]!
    expect(mode.id).toBe('expert:security-auditor')
    expect(mode.instructions).toBe(expert.instructions)
    expect(mode.availableTools).toEqual(['view', 'find_files'])
    expect(mode.defaultModelId).toBe('anthropic/claude-sonnet-4-6')
    expect(mode.metadata).toMatchObject({ kind: 'expert', slug: 'security-auditor' })
  })

  it('skips invalid files with warnings without blocking valid siblings', () => {
    const workspace = tempWorkspace()
    writeExpert(workspace, 'good.md', VALID_EXPERT)
    writeExpert(workspace, 'no-frontmatter.md', 'just some text, no frontmatter')
    writeExpert(workspace, 'bad-yaml.md', '---\nname: [unclosed\n---\n\nbody')
    writeExpert(workspace, 'missing-name.md', '---\ndescription: no name here\n---\n\nbody')
    writeExpert(workspace, 'empty-body.md', '---\nname: X\ndescription: Y\n---\n')
    writeExpert(workspace, 'notes.txt', 'ignored non-md file')

    const result = scanExpertModes({ workspacePath: workspace, configDirName: '.mastracode' })
    expect(result.experts.map((expert) => expert.slug)).toEqual(['good'])
    expect(result.warnings).toHaveLength(4)
    expect(result.warnings.join('\n')).toContain('no-frontmatter.md')
    expect(result.warnings.join('\n')).toContain('bad-yaml.md')
    expect(result.warnings.join('\n')).toContain('missing-name.md')
    expect(result.warnings.join('\n')).toContain('empty-body.md')
  })

  it('derives the mode id from the file slug and rejects unsafe file names', () => {
    const workspace = tempWorkspace()
    const parsed = parseExpertFile(
      '/x/agents/security-auditor.md',
      VALID_EXPERT
    )
    expect(parsed.expert?.id).toBe('expert:security-auditor')

    const bad = parseExpertFile('/x/agents/Not Kebab!.md', VALID_EXPERT)
    expect(bad.expert).toBeUndefined()
    expect(bad.reason).toContain('kebab-case')
  })

  it('expertToMode leaves tool visibility unrestricted when tools are absent', () => {
    const workspace = tempWorkspace()
    writeExpert(
      workspace,
      'writer.md',
      '---\nname: Writer\ndescription: 文档专家\n---\n\n正文说明'
    )
    const { experts } = scanExpertModes({ workspacePath: workspace })
    const mode = expertToMode(experts[0]!)
    expect(mode.availableTools).toBeUndefined()
    expect(mode.defaultModelId).toBeUndefined()
  })
})

describe('expert save and round trip', () => {
  it('serializes, writes, and rescans the same definition', () => {
    const workspace = tempWorkspace()
    const service = createRuntimeExpertService({ workspacePath: workspace, configDirName: '.mastracode' })
    expect(service.directory()).toBe(expertsDirectory(workspace, '.mastracode'))

    const saved = service.save({
      name: '测试工程师',
      description: '设计边界测试用例',
      instructions: '你是一名测试专家。',
      tools: ['view', 'bash'],
      tags: ['测试']
    })
    expect(saved.requiresRestart).toBe(true)
    // 非 ASCII name 无法生成 kebab-case slug，回退到 'expert'
    expect(saved.slug).toBe('expert')
    expect(saved.path).toContain(join('.mastracode', 'agents'))

    const rescan = service.scan()
    expect(rescan.warnings).toEqual([])
    expect(rescan.experts).toHaveLength(1)
    const expert = rescan.experts[0]!
    expect(expert.name).toBe('测试工程师')
    expect(expert.instructions).toBe('你是一名测试专家。')
    expect(expert.tools).toEqual(['view', 'bash'])
    expect(expert.id).toBe(`expert:${expert.slug}`)
  })

  it('overwrites an existing slug instead of duplicating', () => {
    const workspace = tempWorkspace()
    const service = createRuntimeExpertService({ workspacePath: workspace, configDirName: '.mastracode' })
    service.save({ name: 'Reviewer', description: 'first', instructions: 'v1' })
    service.save({ name: 'Reviewer', description: 'second', instructions: 'v2' })
    const { experts } = service.scan()
    expect(experts).toHaveLength(1)
    expect(experts[0]?.instructions).toBe('v2')
  })

  it('round-trips through serializeExpertDefinition directly', () => {
    const { fileName, content } = serializeExpertDefinition({
      name: 'Performance Optimizer',
      description: '性能优化专家',
      instructions: '你是一名性能优化专家。',
      suggestedPrompts: ['分析这段热点代码']
    })
    expect(fileName).toBe('performance-optimizer.md')
    const parsed = parseExpertFile(`/x/agents/${fileName}`, content)
    expect(parsed.expert?.suggestedPrompts).toEqual(['分析这段热点代码'])
    expect(parsed.expert?.instructions).toBe('你是一名性能优化专家。')
  })
})

describe('controller config integration', () => {
  it('merges scanned expert modes into config.modes after builtin modes', () => {
    const workspace = tempWorkspace()
    writeExpert(workspace, 'security-auditor.md', VALID_EXPERT)
    const config = createControllerConfig({ workspacePath: workspace, configDir: '.mastracode' })
    const ids = (config.modes ?? []).map((mode) => mode.id)
    expect(ids).toContain('expert:security-auditor')
    expect(ids.indexOf('expert:security-auditor')).toBeGreaterThan(ids.indexOf('pentest'))
  })

  it('produces no expert modes when the directory is absent', () => {
    const config = createControllerConfig({ workspacePath: tempWorkspace() })
    expect((config.modes ?? []).some((mode) => mode.id.startsWith('expert:'))).toBe(false)
  })
})

describe('user-level agents directory', () => {
  function tempUserDir(): string {
    return tempWorkspace()
  }

  function writeUserExpert(userDir: string, fileName: string, content: string): void {
    mkdirSync(userDir, { recursive: true })
    writeFileSync(join(userDir, fileName), content, 'utf8')
  }

  it('merges user-level experts into the scan and prefers workspace on slug conflict', () => {
    const workspace = tempWorkspace()
    const userDir = tempUserDir()
    writeExpert(workspace, 'security-auditor.md', VALID_EXPERT)
    writeUserExpert(userDir, 'security-auditor.md', VALID_EXPERT)
    writeUserExpert(
      userDir,
      'senior-fullstack-architect.md',
      `---
name: 全栈架构师
description: 用户级通用架构人设。
---
你是资深全栈架构师。`
    )

    const result = scanExpertModes({ workspacePath: workspace, userDirectory: userDir })
    expect(result.experts.map((expert) => expert.slug)).toEqual([
      'security-auditor',
      'senior-fullstack-architect'
    ])
    expect(result.warnings).toEqual([
      'security-auditor.md: skipped — workspace-level expert with same slug wins'
    ])
    // 工作区来源的安全专家未被用户级同名文件覆盖
    expect(result.experts[0]!.sourcePath).toBe(
      join(workspace, '.mastracode', 'agents', 'security-auditor.md')
    )
  })

  it('writes scope=user experts into the user directory', () => {
    const workspace = tempWorkspace()
    const userDir = tempUserDir()
    const service = createRuntimeExpertService({ workspacePath: workspace, userDirectory: userDir })
    const saved = service.save({
      name: '全栈架构师',
      description: '用户级通用架构人设。',
      instructions: '你是资深全栈架构师。',
      slug: 'senior-fullstack-architect',
      scope: 'user'
    })
    expect(saved.path).toBe(join(userDir, 'senior-fullstack-architect.md'))
    expect(service.list().map((expert) => expert.slug)).toContain('senior-fullstack-architect')

    // 删除时工作区不存在同名文件则回退用户级目录
    expect(service.delete('senior-fullstack-architect')).toEqual({
      removed: true,
      requiresRestart: true
    })
    expect(service.list()).toEqual([])
  })
})
