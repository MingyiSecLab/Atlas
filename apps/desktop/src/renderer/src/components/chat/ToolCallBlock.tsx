import type { ToolBlock } from './types'
import { SkillMessage } from './skills/SkillMessage'
import { ToolCallCard } from './tool-ui'

function skillName(input: string | undefined): string | undefined {
  if (!input) return undefined
  try {
    const parsed = JSON.parse(input) as { name?: unknown }
    return typeof parsed.name === 'string' ? parsed.name : undefined
  } catch {
    return undefined
  }
}

export function ToolCallBlock({ block }: { block: ToolBlock }): React.ReactNode {
  const activatedSkill = block.name === 'skill' ? skillName(block.input) : undefined

  if (activatedSkill && block.output) {
    return (
      <SkillMessage skill={{ type: 'skill', name: activatedSkill, instructions: block.output }} />
    )
  }

  return <ToolCallCard block={block} />
}
