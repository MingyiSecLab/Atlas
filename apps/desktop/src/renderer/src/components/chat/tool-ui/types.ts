import type { ChatBlock, ReasoningBlock, ToolBlock } from '../types'

export type ToolCategory = 'terminal' | 'file_op' | 'search' | 'security' | 'general'

export interface ParsedToolCall {
  category: ToolCategory
  displayName: string
  command?: string
  filePath?: string
  searchQuery?: string
  targetUrl?: string
  primaryParam?: string
  parsedArgs?: Record<string, unknown> | null
  isJsonArgs: boolean
}

/**
 * 聚合执行步骤单元
 */
export interface ToolGroupStep {
  id: string
  toolBlock: ToolBlock
  parsed: ParsedToolCall
  precedingReasoning?: string
}

/**
 * 聚合 ToolGroup 的整体状态
 */
export interface ToolGroupSummary {
  status: 'running' | 'success' | 'error' | 'pending'
  steps: ToolGroupStep[]
  totalCount: number
  successCount: number
  errorCount: number
  runningIndex?: number // 1-based 当前运行步骤编号
  runningStepName?: string
  categoryPills: string[]
  headline: string
}

/**
 * 安全解析 JSON 字符串
 */
export function safeParseJson(input?: string): Record<string, unknown> | null {
  if (!input || typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

/**
 * 精简显示终端命令行，去掉重复的工作目录前缀
 */
function simplifyCommandLine(cmd: string): string {
  let cleaned = cmd.trim()
  // 去除例如 `cd /home/kali/workspace && ` 这种冗长前缀
  cleaned = cleaned.replace(/^cd\s+[^&]+\s*&&\s*/, '')
  return cleaned
}

/**
 * 根据工具名称和输入提取工具分类和主要参数
 */
export function analyzeToolCall(block: ToolBlock): ParsedToolCall {
  const name = block.name.toLowerCase()
  const args = safeParseJson(block.input)
  const isJsonArgs = args !== null

  // 1. 终端/命令行类别 (run_command, kali_exec, bash, exec, etc.)
  if (
    name === 'run_command' ||
    name === 'bash' ||
    name === 'execute_command' ||
    name === 'terminal' ||
    name === 'kali_exec' ||
    name.includes('command') ||
    name.includes('bash') ||
    name.includes('exec')
  ) {
    const rawCmd =
      (args?.CommandLine as string) ||
      (args?.command as string) ||
      (args?.cmd as string) ||
      (!isJsonArgs && block.input ? block.input.trim() : undefined)

    const cmd = rawCmd ? simplifyCommandLine(rawCmd) : undefined
    let shortParam = cmd
    if (shortParam && shortParam.length > 50) {
      shortParam = shortParam.slice(0, 50) + '...'
    }

    return {
      category: 'terminal',
      displayName: name === 'kali_exec' ? 'Kali 终端' : '终端命令',
      command: rawCmd,
      primaryParam: shortParam,
      parsedArgs: args,
      isJsonArgs
    }
  }

  // 2. 文件操作类别
  if (
    name === 'view_file' ||
    name === 'read_file' ||
    name === 'write_to_file' ||
    name === 'replace_file_content' ||
    name === 'multi_replace_file_content' ||
    name === 'list_dir' ||
    name.includes('file')
  ) {
    const path =
      (args?.AbsolutePath as string) ||
      (args?.TargetFile as string) ||
      (args?.DirectoryPath as string) ||
      (args?.filePath as string) ||
      (args?.path as string)
    let display = '文件操作'
    if (name.includes('view') || name.includes('read')) display = '查看文件'
    else if (name.includes('write')) display = '写入文件'
    else if (name.includes('replace')) display = '编辑文件'
    else if (name.includes('dir')) display = '目录浏览'

    const fileName = path ? path.split('/').pop() || path : undefined

    return {
      category: 'file_op',
      displayName: display,
      filePath: path,
      primaryParam: fileName,
      parsedArgs: args,
      isJsonArgs
    }
  }

  // 3. 搜索与查询类别
  if (
    name === 'search_web' ||
    name === 'grep_search' ||
    name.includes('search') ||
    name.includes('grep')
  ) {
    const query = (args?.query as string) || (args?.Query as string)
    const isWeb = name.includes('web')
    return {
      category: 'search',
      displayName: isWeb ? '网页搜索' : '代码搜索',
      searchQuery: query,
      primaryParam: query
        ? `"${query.length > 25 ? query.slice(0, 25) + '...' : query}"`
        : undefined,
      parsedArgs: args,
      isJsonArgs
    }
  }

  // 4. 安全与渗透测试类别
  if (
    name.includes('auth') ||
    name.includes('crawl') ||
    name.includes('endpoint') ||
    name.includes('pentest') ||
    name.includes('security') ||
    name.includes('scan') ||
    name.includes('task_') ||
    name === 'read_url_content'
  ) {
    const url =
      (args?.url as string) ||
      (args?.Url as string) ||
      (args?.targetUrl as string) ||
      (args?.target as string)

    let display = '安全工具'
    if (name.includes('auth')) display = '认证检测'
    else if (name.includes('crawl')) display = '网站抓取'
    else if (name.includes('endpoint')) display = '接口提取'
    else if (name.includes('url')) display = '读取网页'
    else if (name.includes('task')) display = '任务编排'
    else if (name.includes('init_pentest')) display = '渗透初始化'
    else if (name.includes('scan')) display = '安全扫描'

    let shortParam: string | undefined
    if (url) {
      try {
        const u = new URL(url)
        shortParam = u.pathname !== '/' ? `${u.hostname}${u.pathname}` : u.hostname
      } catch {
        shortParam = url.length > 35 ? url.slice(0, 35) + '...' : url
      }
    } else if (name.includes('task') && typeof args?.task_name === 'string') {
      shortParam = args.task_name as string
    } else if (name.includes('task') && typeof args?.name === 'string') {
      shortParam = args.name as string
    } else if (block.summary) {
      shortParam = block.summary
    }

    return {
      category: 'security',
      displayName: display,
      targetUrl: url,
      primaryParam: shortParam,
      parsedArgs: args,
      isJsonArgs
    }
  }

  // 5. 通用工具
  return {
    category: 'general',
    displayName: block.name,
    primaryParam: block.summary,
    parsedArgs: args,
    isJsonArgs
  }
}

/**
 * 汇总计算一个 ToolGroup 的整体状态与摘要
 */
export function calculateToolGroupSummary(steps: ToolGroupStep[]): ToolGroupSummary {
  const totalCount = steps.length
  let successCount = 0
  let errorCount = 0
  let isRunning = false
  let runningIndex: number | undefined
  let runningStepName: string | undefined

  const categoryMap = new Map<string, number>()

  steps.forEach((step, idx) => {
    const st = step.toolBlock.status
    if (st === 'running' || st === 'pending' || st === 'waiting_approval') {
      isRunning = true
      if (runningIndex === undefined) {
        runningIndex = idx + 1
        runningStepName = step.parsed.displayName || step.toolBlock.name
      }
    } else if (st === 'error' || st === 'denied') {
      errorCount++
    } else if (st === 'success') {
      successCount++
    }

    const name = step.parsed.displayName || step.toolBlock.name
    categoryMap.set(name, (categoryMap.get(name) || 0) + 1)
  })

  let status: 'running' | 'success' | 'error' | 'pending' = 'success'
  if (isRunning) {
    status = 'running'
  } else if (errorCount > 0) {
    status = 'error'
  }

  // 生成种类胶囊标签列表，例如 ["Kali 终端 × 4", "认证检测", "任务编排"]
  const categoryPills: string[] = []
  categoryMap.forEach((count, cat) => {
    categoryPills.push(count > 1 ? `${cat} × ${count}` : cat)
  })

  // 生成 Headline 文案
  let headline = ''
  if (isRunning) {
    headline = runningStepName
      ? `正在执行第 ${runningIndex || 1}/${totalCount} 步 · ${runningStepName}`
      : `正在执行 ${totalCount} 个操作...`
  } else if (errorCount > 0) {
    headline = `已执行 ${totalCount} 个步骤 (${successCount} 成功, ${errorCount} 失败)`
  } else {
    headline = `已完成 ${totalCount} 个步骤`
  }

  return {
    status,
    steps,
    totalCount,
    successCount,
    errorCount,
    runningIndex,
    runningStepName,
    categoryPills,
    headline
  }
}

/**
 * 聚合 ChatBlock 流：将连续的 (ReasoningBlock? + ToolBlock)+ 聚合成 ToolGroupUnit
 */
export type RenderUnit =
  | { type: 'single'; block: ChatBlock; key: string }
  | { type: 'tool_group'; summary: ToolGroupSummary; key: string }

export function groupChatBlocks(blocks: ChatBlock[], messageId: string): RenderUnit[] {
  const units: RenderUnit[] = []
  let currentGroupSteps: ToolGroupStep[] = []
  let pendingReasoning: ReasoningBlock | null = null

  const flushCurrentGroup = (): void => {
    if (currentGroupSteps.length === 0) return

    if (currentGroupSteps.length === 1) {
      // 只有 1 个工具调用时：如果带前置思考，先把前置思考作为单个块输出，再把工具输出为单块
      const single = currentGroupSteps[0]
      if (single.precedingReasoning) {
        units.push({
          type: 'single',
          block: {
            type: 'reasoning',
            text: single.precedingReasoning,
            isStreaming: false
          },
          key: `${messageId}-reasoning-${single.id}`
        })
      }
      units.push({
        type: 'single',
        block: single.toolBlock,
        key: `${messageId}-tool-${single.id}`
      })
    } else {
      // 2 个及以上连续工具调用，聚合为 ToolGroup
      const summary = calculateToolGroupSummary(currentGroupSteps)
      units.push({
        type: 'tool_group',
        summary,
        key: `${messageId}-toolgroup-${currentGroupSteps[0].id}`
      })
    }
    currentGroupSteps = []
  }

  blocks.forEach((block, index) => {
    if (!block) return

    if (block.type === 'reasoning') {
      // 如果前面已经有缓存的 reasoning，先flush
      if (pendingReasoning) {
        // 如果前面有收集中的 group，说明 reasoning 是在 group 内部的两次 tool 之间
        // 挂给下一个 tool
      }
      pendingReasoning = block
      return
    }

    if (block.type === 'tool') {
      const parsed = analyzeToolCall(block)
      currentGroupSteps.push({
        id: `${index}`,
        toolBlock: block,
        parsed,
        precedingReasoning: pendingReasoning?.text?.trim() ? pendingReasoning.text : undefined
      })
      pendingReasoning = null
      return
    }

    // 遇到 text 或 skill 等非 tool/reasoning 块：
    // 先把之前累积的 pendingReasoning 输出（如果有）
    if (pendingReasoning) {
      flushCurrentGroup()
      units.push({
        type: 'single',
        block: pendingReasoning,
        key: `${messageId}-reasoning-${index}`
      })
      pendingReasoning = null
    } else {
      flushCurrentGroup()
    }

    // 压入当前块
    units.push({
      type: 'single',
      block,
      key: `${messageId}-${block.type}-${index}`
    })
  })

  // 处理末尾残留
  if (pendingReasoning) {
    flushCurrentGroup()
    units.push({
      type: 'single',
      block: pendingReasoning,
      key: `${messageId}-reasoning-end`
    })
  } else {
    flushCurrentGroup()
  }

  return units
}
