export type HubTab = 'expert' | 'skill' | 'tool'

export interface ExpertItem {
  id: string
  name: string
  title: string
  avatarBg?: string
  iconName?: string
  description: string
  systemPrompt: string
  tags: string[]
  isCustom?: boolean
  modelId?: string
  createdAt?: string
  updatedAt?: string
  suggestedPrompts?: string[]
}

export interface SkillItem {
  id: string
  name: string
  identifier: string
  author: string
  iconName?: string
  logo?: string
  description: string
  categories: string[]
  tags: string[]
  isBuiltin?: boolean
  isEnabled?: boolean
  toolsCount?: number
  tools?: string[]
  /** 来自本地工作区扫描的技能（Runtime WorkspaceSkills），无需安装。 */
  isLocal?: boolean
  sourcePath?: string
}

export interface ToolItem {
  id: string
  name: string
  identifier: string
  author: string
  iconName?: string
  description: string
  category: string
  tags: string[]
  isBuiltin?: boolean
  isEnabled?: boolean
  parametersCount?: number
  usageExample?: string
}

export interface BuiltinConnector {
  id: string
  name: string
  identifier: string
  author: string
  iconName?: string
  logo?: string
  description: string
  transport: string
  status: {
    connected: boolean
    connecting?: boolean
    disabled?: boolean
    toolCount: number
    toolNames: string[]
  }
  tags: string[]
  categories: string[]
  tools: string[]
}
