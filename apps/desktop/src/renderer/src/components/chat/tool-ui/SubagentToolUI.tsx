import { useEffect, useState } from 'react'
import { AlertCircle, Bot, GitBranch, Loader2, Sparkles } from 'lucide-react'
import type { ToolBlock } from '../types'
import type { ParsedToolCall } from './types'
import { Markdown } from '@renderer/components/assistant-ui/elements/markdown-text'
import { paper } from '@renderer/components/assistant-ui/elements/surfaces'
import { cn } from '@renderer/lib/utils'
import type { RuntimeSubagentInfo } from '../../../../../shared/runtime-ipc'

interface SubagentToolUIProps {
  block: ToolBlock
  parsed: ParsedToolCall
}

/**
 * subagent 目录是静态定义（不随会话变化），进程内拉一次即可；
 * 这里在模块级缓存 Promise + 结果，避免每条 subagent 卡片各发一次 IPC。
 */
let catalogPromise: Promise<RuntimeSubagentInfo[]> | null = null
let catalogCache: RuntimeSubagentInfo[] | null = null

function loadSubagentCatalog(): Promise<RuntimeSubagentInfo[]> {
  if (catalogCache) return Promise.resolve(catalogCache)
  if (!catalogPromise) {
    catalogPromise = window.api.subagents
      .list()
      .then((entries) => {
        catalogCache = entries
        return entries
      })
      .catch(() => {
        // 目录只用于把 agentType 解析成可读名称；拉取失败时回退展示原始 id，
        // 并清掉缓存的 Promise 以便下次重试。
        catalogPromise = null
        return []
      })
  }
  return catalogPromise
}

function useSubagentCatalog(): RuntimeSubagentInfo[] | null {
  const [catalog, setCatalog] = useState<RuntimeSubagentInfo[] | null>(catalogCache)
  useEffect(() => {
    if (catalog) return
    let active = true
    void loadSubagentCatalog().then((entries) => {
      if (active) setCatalog(entries)
    })
    return () => {
      active = false
    }
  }, [catalog])
  return catalog
}

/** 把事件的 agentType（即 subagent id）解析为目录里的可读信息；未知时回退原始 id。 */
function useSubagentInfo(agentType?: string): RuntimeSubagentInfo | undefined {
  const catalog = useSubagentCatalog()
  if (!agentType) return undefined
  return catalog?.find((entry) => entry.id === agentType)
}

export function SubagentToolUI({ block, parsed }: SubagentToolUIProps): React.ReactNode {
  const args = parsed.parsedArgs
  const agentType = typeof args?.agentType === 'string' ? args.agentType : undefined
  const task = typeof args?.task === 'string' ? args.task : undefined
  const isForked = args?.forked === true
  const info = useSubagentInfo(agentType)

  const output = block.output || ''
  const isError = block.status === 'error' || block.status === 'denied'
  // 目录未加载/未命中时退回 agentType，保证卡片始终有可辨识的标题。
  const displayTitle = info?.name || agentType || parsed.displayName

  return (
    <div className="flex flex-col gap-2.5 p-1 text-xs">
      {/* 委派目标：subagent 名称 + 类型标识 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-[11.5px] max-w-[85%]">
          {isError ? (
            <Bot size={13} className="text-destructive shrink-0" />
          ) : block.status === 'running' ? (
            <Loader2 size={13} className="animate-spin text-primary shrink-0" />
          ) : (
            <Bot size={13} className="text-primary shrink-0" />
          )}
          <span className="truncate font-medium" title={agentType}>
            {displayTitle}
          </span>
        </div>
        {info?.builtin ? (
          <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10.5px] text-muted-foreground">
            内置
          </span>
        ) : null}
        {isForked ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10.5px] text-muted-foreground">
            <GitBranch size={11} />
            独立上下文
          </span>
        ) : null}
      </div>

      {info?.description ? (
        <div className="text-[11px] text-muted-foreground/80 leading-relaxed">
          {info.description}
        </div>
      ) : null}

      {/* 委派任务：子 agent 收到的指令 */}
      {task ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            委派任务
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-foreground/85 leading-relaxed whitespace-pre-wrap">
            {task}
          </div>
        </div>
      ) : null}

      {/* 返回结果 / 运行态 / 错误 */}
      {isError && output ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <div className="font-mono text-xs break-all leading-relaxed">{output}</div>
        </div>
      ) : output ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            <span>子 Agent 返回</span>
            {block.outputTruncated ? (
              <small className="text-muted-foreground/60 font-normal lowercase tracking-normal">
                （已截断）
              </small>
            ) : null}
          </div>
          <div className={cn(paper, 'rounded-xl overflow-hidden')}>
            <Markdown text={output} className="px-3.5 py-2 text-[12px] leading-relaxed" />
          </div>
        </div>
      ) : block.status === 'running' ? (
        <div className="flex items-center gap-2 py-2 text-muted-foreground">
          <Sparkles size={13} className="animate-pulse text-primary" />
          <span className="text-xs">{displayTitle} 执行中...</span>
        </div>
      ) : null}
    </div>
  )
}
