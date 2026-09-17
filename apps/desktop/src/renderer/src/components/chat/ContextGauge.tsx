import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { RuntimeTokenUsage } from '@mingyi/runtime'
import { cn } from '@renderer/lib/utils'
import { formatTokenCount, getModelContextLimit } from './token-counter'

export interface ContextGaugeProps {
  tokenUsage?: RuntimeTokenUsage
  model: string
  reducedMotion?: boolean | null
  className?: string
}

export const ContextGauge: React.FC<ContextGaugeProps> = ({
  tokenUsage,
  model,
  reducedMotion = false,
  className
}) => {
  const [isOpen, setIsOpen] = useState(false)

  const contextLimit = useMemo(() => getModelContextLimit(model), [model])
  const totalTokens = tokenUsage?.totalTokens ?? 0
  const promptTokens = tokenUsage?.promptTokens ?? 0
  const completionTokens = tokenUsage?.completionTokens ?? 0
  const reasoningTokens = tokenUsage?.reasoningTokens ?? 0
  const cachedTokens = tokenUsage?.cachedInputTokens ?? 0

  const usageRatio = contextLimit > 0 ? totalTokens / contextLimit : 0
  const usagePercent = Math.min(100, Math.round(usageRatio * 100))
  const remainingTokens = Math.max(0, contextLimit - totalTokens)

  // 状态级别: normal (< 70%), warning (70% - 88%), danger (> 88%)
  const statusLevel = useMemo<'normal' | 'warning' | 'danger'>(() => {
    if (usagePercent >= 88) return 'danger'
    if (usagePercent >= 70) return 'warning'
    return 'normal'
  }, [usagePercent])

  // 环形进度参数
  const radius = 7.5
  const circumference = 2 * Math.PI * radius
  // 保证哪怕 0% 也显示一点点端点
  const displayProgress = Math.min(1, Math.max(0.04, usageRatio))
  const strokeOffset = circumference * (1 - displayProgress)

  // 当无 token 使用量或总量为 0 时（如新会话 / 未产生消耗），不显示突兀的占位
  if (totalTokens === 0) {
    return null
  }

  return (
    <div
      className={`relative inline-flex items-center ${className || ''}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {/* 触发芯片 */}
      <button
        type="button"
        className={cn(
          'relative inline-flex h-7 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 hover:bg-muted px-2.5 text-xs font-mono font-medium transition-colors cursor-pointer select-none active:scale-95',
          statusLevel === 'normal' && 'text-muted-foreground hover:text-foreground',
          statusLevel === 'warning' && 'border-amber-500/30 text-amber-500 hover:bg-amber-500/10',
          statusLevel === 'danger' &&
            'border-destructive/30 text-destructive hover:bg-destructive/10',
          isOpen && 'bg-muted text-foreground ring-1 ring-primary/30'
        )}
        aria-label={`Token 消耗: ${formatTokenCount(totalTokens)} / ${formatTokenCount(contextLimit)} (${usagePercent}%)`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <svg className="size-4 shrink-0 -rotate-90" viewBox="0 0 20 20">
          <circle
            cx="10"
            cy="10"
            r={radius}
            fill="none"
            strokeWidth="2.2"
            className="stroke-muted/40"
          />
          <circle
            cx="10"
            cy="10"
            r={radius}
            fill="none"
            strokeWidth="2.2"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            className={cn(
              'transition-all duration-300',
              statusLevel === 'normal' && 'stroke-primary',
              statusLevel === 'warning' && 'stroke-amber-500',
              statusLevel === 'danger' && 'stroke-destructive'
            )}
          />
        </svg>
        <span className="text-[11px] font-mono leading-none">{formatTokenCount(totalTokens)}</span>
      </button>

      {/* 悬浮展开的毛玻璃卡片 */}
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="absolute bottom-full right-0 mb-2 z-50 w-64 rounded-xl border border-border/80 bg-popover/95 p-3.5 text-xs text-popover-foreground shadow-xl backdrop-blur-md select-none"
            role="tooltip"
            initial={reducedMotion ? false : { opacity: 0, scale: 0.96, y: 6 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: reducedMotion
                ? { duration: 0 }
                : { duration: 0.15, ease: [0.16, 1, 0.3, 1] }
            }}
            exit={{
              opacity: 0,
              scale: 0.96,
              y: 4,
              transition: reducedMotion
                ? { duration: 0 }
                : { duration: 0.1, ease: [0.4, 0, 0.2, 1] }
            }}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border/50">
              <span className="text-xs font-semibold text-foreground">上下文容量监控</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  statusLevel === 'normal' && 'bg-primary/10 text-primary',
                  statusLevel === 'warning' && 'bg-amber-500/10 text-amber-500',
                  statusLevel === 'danger' && 'bg-destructive/10 text-destructive'
                )}
              >
                {usagePercent}%
              </span>
            </div>

            {/* 多段分色进度条 */}
            <div
              className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-muted/60"
              title={`已用: ${usagePercent}%`}
            >
              {promptTokens > 0 && contextLimit > 0 ? (
                <div
                  className="bg-primary transition-all duration-300"
                  style={{ width: `${Math.min(100, (promptTokens / contextLimit) * 100)}%` }}
                  title={`Prompt 输入: ${promptTokens.toLocaleString()}`}
                />
              ) : null}
              {completionTokens > 0 && contextLimit > 0 ? (
                <div
                  className="bg-sky-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, (completionTokens / contextLimit) * 100)}%` }}
                  title={`Completion 输出: ${completionTokens.toLocaleString()}`}
                />
              ) : null}
            </div>

            {/* 明细项 */}
            <div className="mt-3 flex flex-col gap-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2 rounded-full bg-primary" />
                  输入 (Prompt):
                </span>
                <strong className="font-mono text-foreground">
                  {promptTokens.toLocaleString()}
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2 rounded-full bg-sky-500" />
                  输出 (Completion):
                </span>
                <strong className="font-mono text-foreground">
                  {completionTokens.toLocaleString()}
                </strong>
              </div>
              {reasoningTokens > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2 rounded-full bg-purple-500" />
                    深度思考 (Reasoning):
                  </span>
                  <strong className="font-mono text-foreground">
                    {reasoningTokens.toLocaleString()}
                  </strong>
                </div>
              ) : null}
              {cachedTokens > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    缓存命中 (Cache):
                  </span>
                  <strong className="font-mono text-foreground">
                    {cachedTokens.toLocaleString()}
                  </strong>
                </div>
              ) : null}
            </div>

            <div className="my-2.5 h-px bg-border/50" />

            {/* 汇总与剩余量 */}
            <div className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                <span>会话消耗:</span>
                <strong className="font-mono">{totalTokens.toLocaleString()} tokens</strong>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>可用余量:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                  {remainingTokens.toLocaleString()} ({Math.max(0, 100 - usagePercent)}%)
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
                <span>模型上限:</span>
                <span className="font-mono">{contextLimit.toLocaleString()} tokens</span>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
