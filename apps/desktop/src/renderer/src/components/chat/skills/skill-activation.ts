import type { SkillBlock } from '../types'

const SKILL_PATTERN = /^<skill\s+name="([^"]+)">([\s\S]*?)<\/skill>$/
const ARGUMENTS_MARKER = '\n\nARGUMENTS: '

export function parseSkillActivation(text: string): SkillBlock | undefined {
  const match = SKILL_PATTERN.exec(text.trim())
  const name = match?.[1]
  if (!match || !name) return undefined

  let body = match[2] ?? ''
  if (body.startsWith('\n')) body = body.slice(1)
  if (body.endsWith('\n')) body = body.slice(0, -1)
  body = body.replaceAll('&lt;/skill&gt;', '</skill>')

  const argumentIndex = body.lastIndexOf(ARGUMENTS_MARKER)
  const instructions = argumentIndex >= 0 ? body.slice(0, argumentIndex) : body
  const argumentsValue =
    argumentIndex >= 0 ? body.slice(argumentIndex + ARGUMENTS_MARKER.length).trim() : undefined

  return {
    type: 'skill',
    name,
    ...(instructions.trim() ? { instructions } : {}),
    ...(argumentsValue ? { arguments: argumentsValue } : {})
  }
}
