import { z } from 'zod'

/** 专家定义：磁盘上单个 `.mastracode/agents/*.md` 文件的解析结果。 */
export interface RuntimeExpertDefinition {
  /** 稳定 id（`expert:<slug>`），同时是注册 mode 的 id。 */
  id: string
  /** 文件名推导的 slug（kebab-case，不含扩展名）。 */
  slug: string
  name: string
  description: string
  /** Markdown 正文，注册为 mode instructions（系统提示级）。 */
  instructions: string
  /** mode 级工具可见性白名单；缺省不限制。 */
  tools?: string[]
  /** 建议搭配的 skills 标识；由 skills 服务按会话 mode 过滤。 */
  skills?: string[]
  /** 专家默认模型（provider/model）。 */
  model?: string
  tags?: string[]
  icon?: string
  suggestedPrompts?: string[]
  /** 来源文件绝对路径。 */
  sourcePath: string
}

export interface RuntimeExpertScanResult {
  experts: readonly RuntimeExpertDefinition[]
  /** 被跳过的文件及其原因；不阻断启动。 */
  warnings: readonly string[]
}

export interface RuntimeExpertSaveInput {
  /** 文件 slug；缺省时从 name 推导。 */
  slug?: string
  name: string
  description: string
  instructions: string
  tools?: string[]
  skills?: string[]
  model?: string
  tags?: string[]
  icon?: string
  suggestedPrompts?: string[]
  /** 写入位置：workspace（默认，<configDir>/agents/）或 user（用户级 agents/ 目录） */
  scope?: 'user' | 'workspace'
}

export const expertFrontmatterSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  model: z.string().trim().min(1).max(200).optional(),
  tools: z.array(z.string().trim().min(1).max(200)).optional(),
  skills: z.array(z.string().trim().min(1).max(200)).optional(),
  tags: z.array(z.string().trim().min(1).max(100)).optional(),
  icon: z.string().trim().min(1).max(100).optional(),
  suggestedPrompts: z.array(z.string().trim().min(1).max(500)).optional()
})

export type RuntimeExpertFrontmatter = z.infer<typeof expertFrontmatterSchema>
