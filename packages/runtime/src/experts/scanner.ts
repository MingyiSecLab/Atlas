import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { AgentControllerMode } from '@mastra/core/agent-controller'
import {
  expertFrontmatterSchema,
  type RuntimeExpertDefinition,
  type RuntimeExpertSaveInput,
  type RuntimeExpertScanResult
} from './types.js'

export const DEFAULT_EXPERTS_DIRNAME = 'agents'
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function expertSlugFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return SLUG_PATTERN.test(slug) ? slug : 'expert'
}

function slugFromFileName(fileName: string): string | undefined {
  if (!fileName.toLowerCase().endsWith('.md')) return undefined
  const slug = fileName.slice(0, -3).toLowerCase()
  return SLUG_PATTERN.test(slug) ? slug : undefined
}

/** 解析单个专家文件；返回 undefined 表示跳过（reason 给出原因）。 */
export function parseExpertFile(
  sourcePath: string,
  content: string
): { expert?: RuntimeExpertDefinition; reason?: string } {
  const match = FRONTMATTER_PATTERN.exec(content)
  if (!match) return { reason: 'missing frontmatter block (--- ... ---)' }
  let frontmatter: unknown
  try {
    frontmatter = parseYaml(match[1] ?? '')
  } catch (error) {
    return { reason: `invalid YAML frontmatter: ${error instanceof Error ? error.message : String(error)}` }
  }
  const parsed = expertFrontmatterSchema.safeParse(frontmatter)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { reason: `invalid frontmatter at ${issue?.path.join('.') ?? 'root'}: ${issue?.message ?? 'validation failed'}` }
  }
  const instructions = (match[2] ?? '').trim()
  if (!instructions) return { reason: 'markdown body (instructions) must not be empty' }
  const fileName = sourcePath.split(/[\\/]/).pop() ?? ''
  const slug = slugFromFileName(fileName)
  if (!slug) return { reason: `file name must be kebab-case <slug>.md, got ${fileName}` }

  return {
    expert: {
      id: `expert:${slug}`,
      slug,
      name: parsed.data.name,
      description: parsed.data.description,
      instructions,
      ...(parsed.data.tools ? { tools: parsed.data.tools } : {}),
      ...(parsed.data.skills ? { skills: parsed.data.skills } : {}),
      ...(parsed.data.model ? { model: parsed.data.model } : {}),
      ...(parsed.data.tags ? { tags: parsed.data.tags } : {}),
      ...(parsed.data.icon ? { icon: parsed.data.icon } : {}),
      ...(parsed.data.suggestedPrompts ? { suggestedPrompts: parsed.data.suggestedPrompts } : {}),
      sourcePath
    }
  }
}

/** 把专家定义映射为 AgentControllerMode（专家=Mode 的原生注册形态）。 */
export function expertToMode(expert: RuntimeExpertDefinition): AgentControllerMode {
  return {
    id: expert.id,
    name: expert.name,
    description: expert.description,
    instructions: expert.instructions,
    ...(expert.model ? { defaultModelId: expert.model } : {}),
    ...(expert.tools ? { availableTools: expert.tools } : {}),
    metadata: {
      kind: 'expert',
      slug: expert.slug,
      ...(expert.tags ? { tags: expert.tags } : {}),
      ...(expert.icon ? { icon: expert.icon } : {}),
      ...(expert.skills ? { skills: expert.skills } : {}),
      ...(expert.suggestedPrompts ? { suggestedPrompts: expert.suggestedPrompts } : {}),
      sourcePath: expert.sourcePath
    }
  }
}

export function expertsDirectory(workspacePath: string, configDirName?: string): string {
  return join(workspacePath, configDirName ?? '.mastracode', DEFAULT_EXPERTS_DIRNAME)
}

/**
 * 扫描单个专家目录，返回合法专家列表；坏文件以 warning 形式上报，不阻断扫描。
 */
function scanExpertsFromDirectory(
  directory: string,
  warnings: string[]
): RuntimeExpertDefinition[] {
  if (!existsSync(directory)) return []
  const experts: RuntimeExpertDefinition[] = []
  for (const fileName of readdirSync(directory).sort()) {
    if (!fileName.toLowerCase().endsWith('.md')) continue
    const sourcePath = join(directory, fileName)
    let content: string
    try {
      content = readFileSync(sourcePath, 'utf8')
    } catch (error) {
      warnings.push(`${fileName}: unreadable (${error instanceof Error ? error.message : String(error)})`)
      continue
    }
    const { expert, reason } = parseExpertFile(sourcePath, content)
    if (!expert) {
      warnings.push(`${fileName}: skipped — ${reason}`)
      continue
    }
    experts.push(expert)
  }
  return experts
}

/**
 * 扫描 `<workspace>/<configDir>/agents/*.md`，把每个合法文件映射为一个专家与其 mode。
 * `userDirectory` 提供时同时扫描用户级目录（如 ~/.atlas/agents）；slug 冲突时工作区优先。
 * 单个文件损坏只产出 warning，不阻断其余专家和启动流程。
 */
export function scanExpertModes(options: {
  workspacePath: string
  configDirName?: string
  userDirectory?: string
}): RuntimeExpertScanResult & { modes: AgentControllerMode[] } {
  const warnings: string[] = []
  const workspaceExperts = scanExpertsFromDirectory(
    expertsDirectory(options.workspacePath, options.configDirName),
    warnings
  )
  const seen = new Set(workspaceExperts.map((expert) => expert.slug))
  let experts = workspaceExperts
  if (options.userDirectory) {
    for (const expert of scanExpertsFromDirectory(options.userDirectory, warnings)) {
      if (seen.has(expert.slug)) {
        warnings.push(`${expert.slug}.md: skipped — workspace-level expert with same slug wins`)
        continue
      }
      seen.add(expert.slug)
      experts = [...experts, expert]
    }
  }
  return { experts, warnings, modes: experts.map(expertToMode) }
}

/** 把专家定义序列化为磁盘文件内容（frontmatter + 正文）。 */
export function serializeExpertDefinition(input: RuntimeExpertSaveInput): { fileName: string; content: string } {
  const slug = (input.slug ? input.slug.toLowerCase() : expertSlugFromName(input.name)) || 'expert'
  if (!SLUG_PATTERN.test(slug)) throw new Error(`Expert slug must match ${SLUG_PATTERN.source}: ${slug}.`)
  const frontmatter = expertFrontmatterSchema.parse({
    name: input.name,
    description: input.description,
    ...(input.model ? { model: input.model } : {}),
    ...(input.tools?.length ? { tools: input.tools } : {}),
    ...(input.skills?.length ? { skills: input.skills } : {}),
    ...(input.tags?.length ? { tags: input.tags } : {}),
    ...(input.icon ? { icon: input.icon } : {}),
    ...(input.suggestedPrompts?.length ? { suggestedPrompts: input.suggestedPrompts } : {})
  })
  const content = `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n\n${input.instructions.trim()}\n`
  return { fileName: `${slug}.md`, content }
}

/**
 * 将专家文件写入 `<workspace>/<configDir>/agents/`（scope='workspace'，默认）或
 * 用户级目录（scope='user'，需提供 userDirectory）；mode 注册需要重建 runtime 后生效。
 */
export function writeExpertFile(
  options: { workspacePath: string; configDirName?: string; userDirectory?: string },
  input: RuntimeExpertSaveInput
): { path: string; slug: string; requiresRestart: boolean } {
  const { fileName, content } = serializeExpertDefinition(input)
  const directory =
    input.scope === 'user' && options.userDirectory
      ? options.userDirectory
      : expertsDirectory(options.workspacePath, options.configDirName)
  mkdirSync(directory, { recursive: true })
  const path = join(directory, fileName)
  writeFileSync(path, content, 'utf8')
  return { path, slug: fileName.slice(0, -3), requiresRestart: true }
}

/**
 * 删除专家文件；slug 必须是 kebab-case，防路径逃逸。工作区文件不存在时回退删除
 * 用户级目录中的同名文件。mode 注销同样需要重建 runtime。
 */
export function deleteExpertFile(
  options: { workspacePath: string; configDirName?: string; userDirectory?: string },
  slug: string
): { removed: boolean; requiresRestart: boolean } {
  const normalized = slug.toLowerCase().replace(/^expert:/, '')
  if (!SLUG_PATTERN.test(normalized)) throw new Error(`Invalid expert slug: ${slug}.`)
  const workspacePath = join(
    expertsDirectory(options.workspacePath, options.configDirName),
    `${normalized}.md`
  )
  if (existsSync(workspacePath)) {
    unlinkSync(workspacePath)
    return { removed: true, requiresRestart: true }
  }
  if (options.userDirectory) {
    const userPath = join(options.userDirectory, `${normalized}.md`)
    if (existsSync(userPath)) {
      unlinkSync(userPath)
      return { removed: true, requiresRestart: true }
    }
  }
  return { removed: false, requiresRestart: false }
}
