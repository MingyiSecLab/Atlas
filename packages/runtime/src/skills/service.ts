import type { MastraCodeState } from '@mastra/code-sdk/schema'
import type { Session } from '@mastra/core/agent-controller'
import { formatSkillActivation } from '@mastra/core/workspace'
import type { SkillMetadata, WorkspaceSkills } from '@mastra/core/workspace'
import type {
  InvokeRuntimeSkillInput,
  RuntimeSkillInfo,
  RuntimeSkillSearchResult,
  RuntimeSkillService
} from './types.js'

interface RuntimeSkillServiceDependencies {
  resolveSession(sessionId: string): Promise<Session<MastraCodeState>>
  /** 无 sessionId 时回退到启动会话的工作区技能（技能中心等无会话场景）。 */
  resolveDefaultSession?: () => Promise<Session<MastraCodeState>>
  activateSession?: (session: Session<MastraCodeState>) => void
}

function isUserInvocable(skill: Pick<SkillMetadata, 'user-invocable'>): boolean {
  return skill['user-invocable'] !== false
}

function skillInfo(skill: SkillMetadata): RuntimeSkillInfo {
  return {
    name: skill.name,
    path: skill.path,
    description: skill.description
  }
}

async function resolveSkills(
  {
    resolveSession,
    resolveDefaultSession
  }: Pick<RuntimeSkillServiceDependencies, 'resolveSession' | 'resolveDefaultSession'>,
  sessionId: string | undefined
): Promise<{ session: Session<MastraCodeState>; skills: WorkspaceSkills }> {
  const normalizedId = sessionId?.trim()
  const session = normalizedId
    ? await resolveSession(normalizedId)
    : await resolveDefaultSession?.()
  if (!session) throw new Error('No session is available to resolve skills.')
  const skills = session.getWorkspace()?.skills
  if (!skills) throw new Error('No skills are configured for this workspace.')
  await skills.maybeRefresh()
  return { session, skills }
}

function escapeSkillBoundary(value: string): string {
  return value.replaceAll('</skill>', '&lt;/skill&gt;')
}

function skillMessage(name: string, instructions: string, argumentsValue?: string): string {
  const args = argumentsValue?.trim()
  const content = `${instructions}${args ? `\n\nARGUMENTS: ${args}` : ''}`.trim()
  return `<skill name="${name}">\n${escapeSkillBoundary(content)}\n</skill>`
}

export function createRuntimeSkillService({
  resolveSession,
  resolveDefaultSession,
  activateSession
}: RuntimeSkillServiceDependencies): RuntimeSkillService {
  return {
    list: async ({ sessionId, refresh }) => {
      const { skills } = await resolveSkills({ resolveSession, resolveDefaultSession }, sessionId)
      if (refresh) await skills.refresh()
      return (await skills.list()).filter(isUserInvocable).map(skillInfo)
    },

    search: async ({ sessionId, query, topK = 12 }) => {
      const normalizedQuery = query.trim()
      const { skills } = await resolveSkills({ resolveSession, resolveDefaultSession }, sessionId)
      const visible = (await skills.list()).filter(isUserInvocable)
      const byName = new Map(visible.map((skill) => [skill.name, skill]))
      const byPath = new Map(visible.map((skill) => [skill.path, skill]))

      if (!normalizedQuery) {
        return visible.map((skill) => ({
          ...skillInfo(skill),
          content: skill.description,
          score: 1,
          source: 'SKILL.md'
        }))
      }

      const matches = await skills.search(normalizedQuery, { topK })
      const deduped = new Map<string, RuntimeSkillSearchResult>()
      for (const match of matches) {
        const metadata = byPath.get(match.skillPath) ?? byName.get(match.skillName)
        if (!metadata) continue
        const existing = deduped.get(metadata.path)
        if (existing && existing.score >= match.score) continue
        deduped.set(metadata.path, {
          ...skillInfo(metadata),
          content: match.content,
          score: match.score,
          source: match.source
        })
      }

      const queryLower = normalizedQuery.toLowerCase()
      for (const metadata of visible) {
        if (
          !metadata.name.toLowerCase().includes(queryLower) &&
          !metadata.description.toLowerCase().includes(queryLower)
        ) {
          continue
        }
        const existing = deduped.get(metadata.path)
        if (existing) continue
        deduped.set(metadata.path, {
          ...skillInfo(metadata),
          content: metadata.description,
          score: 1,
          source: 'SKILL.md'
        })
      }

      return [...deduped.values()].sort((first, second) => second.score - first.score)
    },

    invoke: async (input: InvokeRuntimeSkillInput) => {
      const { session, skills } = await resolveSkills(
        { resolveSession, resolveDefaultSession },
        input.sessionId
      )
      const skill = await skills.get(input.name.trim())
      if (!skill || !isUserInvocable(skill)) {
        throw new Error(`Skill not found: ${input.name}.`)
      }
      activateSession?.(session)
      await session.sendMessage({
        content: skillMessage(skill.name, formatSkillActivation(skill), input.arguments),
        ...(input.files?.length ? { files: input.files } : {})
      })
    }
  }
}
