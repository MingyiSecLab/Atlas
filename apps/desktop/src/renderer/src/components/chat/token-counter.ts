/**
 * 主流模型的上下文容量（单位：Tokens）
 */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Anthropic
  'claude-3-5-sonnet': 200_000,
  'claude-3-7-sonnet': 200_000,
  'claude-3-5-haiku': 200_000,
  'claude-3-opus': 200_000,
  'anthropic/claude-sonnet-4': 200_000,

  // OpenAI
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  o1: 200_000,
  'o1-mini': 128_000,
  'o3-mini': 200_000,

  // DeepSeek
  'deepseek-chat': 64_000,
  'deepseek-coder': 64_000,
  'deepseek-reasoner': 64_000,

  // Qwen
  'qwen-2.5-coder': 128_000,
  'qwen-max': 128_000,
  'qwen-turbo': 128_000,

  // Gemini
  'gemini-1.5-pro': 1_000_000,
  'gemini-1.5-flash': 1_000_000,
  'gemini-2.0-flash': 1_000_000
}

const DEFAULT_CONTEXT_LIMIT = 128_000

/**
 * 获取模型的上下文窗口限制
 */
export function getModelContextLimit(modelId: string): number {
  const normalized = modelId.toLowerCase()
  for (const [pattern, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (normalized.includes(pattern)) return limit
  }
  return DEFAULT_CONTEXT_LIMIT
}

/**
 * 格式化 token 数值（如 2.4k, 128k）
 */
export function formatTokenCount(count: number): string {
  if (count < 1000) return `${count}`
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`
  return `${Math.round(count / 1000)}k`
}
