import { BookOpen } from 'lucide-react'
import { useState } from 'react'
import { Disclosure } from '../Disclosure'
import { Markdown } from '@renderer/components/assistant-ui/elements/markdown-text'
import type { SkillBlock } from '../types'

export function SkillMessage({ skill }: { skill: SkillBlock }): React.ReactNode {
  const [open, setOpen] = useState(false)

  return (
    <div className="chat-skill-message" role="group" aria-label={`Skill: ${skill.name}`}>
      <Disclosure
        open={open}
        onToggle={() => setOpen((current) => !current)}
        icon={<BookOpen size={14} />}
        title="Skill"
        summary={skill.arguments ? `${skill.name} ${skill.arguments}` : skill.name}
      >
        {skill.instructions ? <Markdown>{skill.instructions}</Markdown> : undefined}
      </Disclosure>
    </div>
  )
}
