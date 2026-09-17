import { Loader2, ShieldAlert, Sparkles, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ChatBlock, ToolBlock } from './types'
import { ThinkingIndicator as ThinkingIndicatorElement } from '@renderer/components/assistant-ui/elements/thinking-indicator'

function formatSeconds(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

interface ThinkingIndicatorProps {
  running: boolean
  blocks: readonly ChatBlock[]
}

/**
 * 瞬时状态行 (Status Line / Thinking Indicator)
 * 基于 assistant-ui elements/thinking-indicator 规范：
 * 专职呈现 Agent 运行期间的瞬态进展：连接等待、深度思考耗时、工具执行状态。
 * 当正文开始流式输出且无未决异步操作时，状态行优雅淡出，不干扰用户阅读。
 */
export function ThinkingIndicator({ running, blocks }: ThinkingIndicatorProps): React.ReactNode {
  const [liveElapsed, setLiveElapsed] = useState(0)

  useEffect(() => {
    if (!running) return undefined

    const start = Date.now()
    const timer = setInterval(() => {
      setLiveElapsed(Math.max(1, Math.floor((Date.now() - start) / 1000)))
    }, 1000)

    return () => {
      clearInterval(timer)
      setLiveElapsed(0)
    }
  }, [running])

  if (!running) return null

  // 1. 检查是否存在正在执行或等待审批的工具调用
  const runningTool = blocks.find(
    (b): b is ToolBlock =>
      b.type === 'tool' &&
      (b.status === 'running' || b.status === 'pending' || b.status === 'waiting_approval')
  )

  // 2. 检查是否有正在流式输出的推理块 (CoT)
  const hasActiveReasoning = blocks.some((b) => b.type === 'reasoning')
  const lastBlock = blocks[blocks.length - 1]
  const isReasoningActive = lastBlock?.type === 'reasoning'

  // 3. 检查是否已经有正文输出
  const hasTextOutput = blocks.some(
    (b) => b.type === 'text' && typeof b.text === 'string' && b.text.trim().length > 0
  )

  // 如果正文已经开始流出，且当前没有未决的工具调用或思考块，则隐藏状态行（让位给正文阅读）
  if (hasTextOutput && !runningTool && !isReasoningActive) {
    return null
  }

  function getToolLabel(toolName?: string): string {
    if (!toolName) return '正在执行工具...'
    const name = toolName.toLowerCase()
    const map: Record<string, string> = {
      bash: '正在执行终端命令...',
      terminal: '正在执行终端命令...',
      read: '正在检索并读取文件...',
      write: '正在创建文件...',
      edit: '正在修改代码...',
      grep: '正在搜索代码模式...',
      glob: '正在扫描项目文件...',
      todo: '正在整理任务清单...',
      browser_subagent: '正在通过浏览器检索...',
      web_search: '正在检索网络资料...',
      search_web: '正在检索网络资料...',
      pentest_analyze: '正在进行安全风险分析...',
      pentest_execute: '正在执行授权安全验证...'
    }
    if (map[name]) return map[name]
    if (name.startsWith('pentest')) return `正在执行安全测试: ${toolName}`
    return `正在执行: ${toolName}`
  }

  let iconNode: React.ReactNode
  let statusText = '正在思考...'

  if (runningTool) {
    if (runningTool.status === 'waiting_approval') {
      iconNode = <ShieldAlert size={14} className="text-amber-500 shrink-0 animate-pulse" />
      statusText = `等待安全授权审批: ${runningTool.name || '工具'}`
    } else {
      iconNode = <Wrench size={14} className="text-blue-500 shrink-0 animate-spin" />
      statusText = getToolLabel(runningTool.name)
    }
  } else if (isReasoningActive || (hasActiveReasoning && !hasTextOutput)) {
    iconNode = <Sparkles size={14} className="text-purple-500 shrink-0 animate-pulse" />
    statusText = '正在深度思考...'
  } else if (!hasTextOutput) {
    iconNode = <Loader2 size={14} className="text-blue-500 shrink-0 animate-spin" />
    statusText = '正在组织思路...'
  }

  const elapsedLabel = liveElapsed > 0 ? formatSeconds(liveElapsed) : undefined

  return (
    <ThinkingIndicatorElement
      label={statusText}
      elapsed={elapsedLabel}
      icon={iconNode}
      className="my-1 px-1"
    />
  )
}
