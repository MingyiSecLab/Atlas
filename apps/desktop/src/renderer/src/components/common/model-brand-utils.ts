export function normalizeProviderKey(providerId: string, url?: string, models?: string[]): string {
  const norm = (providerId || '').toLowerCase().trim()
  const normUrl = (url || '').toLowerCase()

  if (norm.includes('minimax')) return 'minimax'
  if (norm.includes('openai')) return 'openai'
  if (norm.includes('anthropic') || norm.includes('claude')) return 'anthropic'
  if (norm.includes('google') || norm.includes('gemini')) return 'google'
  if (norm.includes('deepseek')) return 'deepseek'
  if (norm.includes('ollama') || normUrl.includes('11434') || normUrl.includes('ollama'))
    return 'ollama'
  if (
    norm.includes('qwen') ||
    norm.includes('tongyi') ||
    norm.includes('alibaba') ||
    norm.includes('aliyun')
  )
    return 'qwen'
  if (norm.includes('moonshot') || norm.includes('kimi')) return 'moonshot'
  // 智谱体系：zhipuai / zhipuai-coding-plan / zai / zai-coding-plan（Z.AI 为智谱海外品牌）
  if (
    norm.includes('zhipu') ||
    norm.includes('chatglm') ||
    norm.includes('glm') ||
    norm === 'zai' ||
    norm.startsWith('zai-') ||
    norm.includes('z.ai')
  )
    return 'zhipu'
  if (norm.includes('baichuan')) return 'baichuan'
  if (norm.includes('doubao') || norm.includes('bytedance') || norm.includes('volcengine'))
    return 'bytedance'
  if (norm.includes('hunyuan') || norm.includes('tencent')) return 'tencent'
  if (norm.includes('azure')) return 'azure'
  if (norm.includes('bedrock') || norm.includes('aws')) return 'bedrock'
  if (norm.includes('openrouter')) return 'openrouter'
  if (norm.includes('together')) return 'togetherai'
  if (norm.includes('fireworks')) return 'fireworks'
  if (norm.includes('cohere')) return 'cohere'
  if (norm.includes('perplexity')) return 'perplexity'
  if (norm.includes('silicon')) return 'siliconcloud'
  if (norm.includes('groq')) return 'groq'
  if (norm.includes('mistral')) return 'mistral'
  if (norm.includes('zeroone') || norm.includes('01')) return 'zeroone'
  if (norm.includes('stepfun') || norm.includes('step')) return 'stepfun'
  if (norm.includes('xai') || norm.includes('grok')) return 'grok'

  if (normUrl.includes('deepseek')) return 'deepseek'
  if (normUrl.includes('openai')) return 'openai'

  if (models && models.length > 0) {
    const combinedModels = models.join(' ').toLowerCase()
    if (combinedModels.includes('qwen')) return 'qwen'
    if (combinedModels.includes('deepseek')) return 'deepseek'
    if (combinedModels.includes('gpt')) return 'openai'
    if (combinedModels.includes('claude')) return 'anthropic'
    if (combinedModels.includes('gemini')) return 'google'
    if (combinedModels.includes('llama')) return 'meta'
    if (combinedModels.includes('mistral')) return 'mistral'
    if (combinedModels.includes('minimax')) return 'minimax'
  }

  return norm
}

export function extractModelPureName(fullModelId: string): string {
  if (!fullModelId) return ''
  const trimmed = fullModelId.trim()
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/')
    return parts[parts.length - 1] || trimmed
  }
  return trimmed
}
