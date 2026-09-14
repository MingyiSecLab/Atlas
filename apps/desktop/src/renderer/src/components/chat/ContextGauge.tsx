import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { RuntimeTokenUsage } from '@mingyi/runtime'
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

  return (
    <div
      className={`context-gauge-container ${className || ''}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {/* 触发芯片 */}
      <button
        type="button"
        className={`context-gauge-chip is-${statusLevel} ${isOpen ? 'is-active' : ''}`}
        aria-label={`Token 消耗: ${formatTokenCount(totalTokens)} / ${formatTokenCount(contextLimit)} (${usagePercent}%)`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <svg
          className={`context-gauge-ring is-${statusLevel}`}
          width="16"
          height="16"
          viewBox="0 0 20 20"
        >
          <circle
            className="context-gauge-ring-bg"
            cx="10"
            cy="10"
            r={radius}
            fill="none"
            strokeWidth="2.2"
          />
          <circle
            className={`context-gauge-ring-progress is-${statusLevel}`}
            cx="10"
            cy="10"
            r={radius}
            fill="none"
            strokeWidth="2.2"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            transform="rotate(-90 10 10)"
          />
        </svg>
        <span className="context-gauge-label">{formatTokenCount(totalTokens)}</span>
      </button>

      {/* 悬浮展开的毛玻璃卡片 */}
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="context-gauge-popover is-right"
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
            <div className="context-gauge-header">
              <span className="context-gauge-title">上下文容量监控</span>
              <span className={`context-gauge-badge is-${statusLevel}`}>{usagePercent}%</span>
            </div>

            {/* 多段分色进度条 */}
            <div className="context-gauge-bar-track" title={`已用: ${usagePercent}%`}>
              {promptTokens > 0 && contextLimit > 0 ? (
                <div
                  className="context-gauge-bar-segment is-prompt"
                  style={{ width: `${Math.min(100, (promptTokens / contextLimit) * 100)}%` }}
                  title={`Prompt 输入: ${promptTokens.toLocaleString()}`}
                />
              ) : null}
              {completionTokens > 0 && contextLimit > 0 ? (
                <div
                  className="context-gauge-bar-segment is-completion"
                  style={{ width: `${Math.min(100, (completionTokens / contextLimit) * 100)}%` }}
                  title={`Completion 输出: ${completionTokens.toLocaleString()}`}
                />
              ) : null}
            </div>

            {/* 明细项 */}
            <div className="context-gauge-details">
              <div className="context-gauge-row">
                <span className="context-gauge-dot is-prompt" />
                <span className="context-gauge-name">输入 (Prompt):</span>
                <strong className="context-gauge-val">{promptTokens.toLocaleString()}</strong>
              </div>
              <div className="context-gauge-row">
                <span className="context-gauge-dot is-completion" />
                <span className="context-gauge-name">输出 (Completion):</span>
                <strong className="context-gauge-val">{completionTokens.toLocaleString()}</strong>
              </div>
              {reasoningTokens > 0 ? (
                <div className="context-gauge-row">
                  <span className="context-gauge-dot is-reasoning" />
                  <span className="context-gauge-name">深度思考 (Reasoning):</span>
                  <strong className="context-gauge-val">{reasoningTokens.toLocaleString()}</strong>
                </div>
              ) : null}
              {cachedTokens > 0 ? (
                <div className="context-gauge-row">
                  <span className="context-gauge-dot is-cached" />
                  <span className="context-gauge-name">缓存命中 (Cache):</span>
                  <strong className="context-gauge-val">{cachedTokens.toLocaleString()}</strong>
                </div>
              ) : null}
            </div>

            <div className="context-gauge-divider" />

            {/* 汇总与剩余量 */}
            <div className="context-gauge-summary">
              <div className="context-gauge-row is-highlight">
                <span>会话消耗:</span>
                <strong>{totalTokens.toLocaleString()} tokens</strong>
              </div>
              <div className="context-gauge-row">
                <span>可用余量:</span>
                <span className="context-gauge-remaining">
                  {remainingTokens.toLocaleString()} ({Math.max(0, 100 - usagePercent)}%)
                </span>
              </div>
              <div className="context-gauge-row is-subtle">
                <span>模型上限:</span>
                <span>{contextLimit.toLocaleString()} tokens</span>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
