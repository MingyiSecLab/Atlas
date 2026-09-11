export interface RuntimeSkillInfo {
  name: string
  path: string
  description: string
}

export interface RuntimeSkillSearchResult extends RuntimeSkillInfo {
  content: string
  score: number
  source: string
}

export interface ListRuntimeSkillsInput {
  /** 省略时读取启动会话的工作区技能（用于无需会话的技能中心展示）。 */
  sessionId?: string
  refresh?: boolean
}

export interface SearchRuntimeSkillsInput {
  /** 省略时读取启动会话的工作区技能。 */
  sessionId?: string
  query: string
  topK?: number
}

export interface InvokeRuntimeSkillInput {
  sessionId: string
  name: string
  arguments?: string
  files?: Array<{
    data: string
    mediaType: string
    filename?: string
  }>
}

export interface RuntimeSkillService {
  list(input: ListRuntimeSkillsInput): Promise<RuntimeSkillInfo[]>
  search(input: SearchRuntimeSkillsInput): Promise<RuntimeSkillSearchResult[]>
  invoke(input: InvokeRuntimeSkillInput): Promise<void>
}
