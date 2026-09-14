import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Search, Check, Brain, Eye, Zap, X } from 'lucide-react'
import { ModelBrandIcon } from '../common/ModelBrandIcon'
import { getModelContextLimit, formatTokenCount } from './token-counter'

export interface ModelPickerProps {
  model: string
  modelOptions: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (model: string) => void
  reducedMotion?: boolean | null
  className?: string
}

interface ModelItemMeta {
  id: string
  provider: string
  isReasoning: boolean
  isVision: boolean
  isFast: boolean
  contextLimit: number
}

function resolveModelProvider(modelId: string): string {
  const norm = modelId.toLowerCase()
  if (norm.includes('claude') || norm.includes('anthropic')) return 'Anthropic'
  if (norm.includes('gpt') || norm.includes('o1') || norm.includes('o3') || norm.includes('openai'))
    return 'OpenAI'
  if (norm.includes('deepseek') || norm.includes('r1')) return 'DeepSeek'
  if (norm.includes('gemini') || norm.includes('google')) return 'Google'
  if (norm.includes('qwen') || norm.includes('tongyi') || norm.includes('alibaba')) return 'Qwen'
  if (norm.includes('llama') || norm.includes('meta')) return 'Meta'
  if (norm.includes('mistral')) return 'Mistral'
  if (norm.includes('ollama')) return 'Ollama'
  return '通用 / 其他'
}

function getModelCapabilities(modelId: string): {
  isReasoning: boolean
  isVision: boolean
  isFast: boolean
} {
  const norm = modelId.toLowerCase()
  const isReasoning =
    norm.includes('reason') ||
    norm.includes('r1') ||
    norm.includes('o1') ||
    norm.includes('o3') ||
    norm.includes('thinking')
  const isVision =
    norm.includes('4o') ||
    norm.includes('gemini') ||
    norm.includes('claude-3') ||
    norm.includes('vision')
  const isFast =
    norm.includes('mini') ||
    norm.includes('flash') ||
    norm.includes('haiku') ||
    norm.includes('turbo')

  return { isReasoning, isVision, isFast }
}

export const ModelPicker: React.FC<ModelPickerProps> = ({
  model,
  modelOptions,
  open,
  onOpenChange,
  onChange,
  reducedMotion = false,
  className
}) => {
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const effectiveOptions = useMemo(() => {
    return modelOptions.length > 0 ? modelOptions : [model]
  }, [modelOptions, model])

  // 整理模型元数据
  const modelsWithMeta = useMemo<ModelItemMeta[]>(() => {
    return effectiveOptions.map((opt) => {
      const caps = getModelCapabilities(opt)
      return {
        id: opt,
        provider: resolveModelProvider(opt),
        ...caps,
        contextLimit: getModelContextLimit(opt)
      }
    })
  }, [effectiveOptions])

  // 过滤后的模型列表
  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return modelsWithMeta
    return modelsWithMeta.filter(
      (item) =>
        item.id.toLowerCase().includes(q) ||
        item.provider.toLowerCase().includes(q) ||
        (item.isReasoning && 'thinking reasoning 思考 深度推理'.includes(q))
    )
  }, [modelsWithMeta, search])

  // 按 Provider 分组
  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelItemMeta[]> = {}
    for (const item of filteredModels) {
      if (!groups[item.provider]) {
        groups[item.provider] = []
      }
      groups[item.provider].push(item)
    }
    return groups
  }, [filteredModels])

  // 展开时重置搜索和高亮索引
  useEffect(() => {
    if (open) {
      setSearch('')
      const currentIndex = filteredModels.findIndex((m) => m.id === model)
      setHighlightIndex(currentIndex >= 0 ? currentIndex : 0)
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    }
  }, [open, model])

  // 外部点击收起
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, onOpenChange])

  // 键盘快捷键支持
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return

      if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange(false)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((prev) => (prev < filteredModels.length - 1 ? prev + 1 : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : filteredModels.length - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const selected = filteredModels[highlightIndex]
        if (selected) {
          onChange(selected.id)
          onOpenChange(false)
        }
      }
    },
    [open, filteredModels, highlightIndex, onChange, onOpenChange]
  )

  const currentContextLimit = useMemo(() => getModelContextLimit(model), [model])

  return (
    <div className={`model-picker-container ${className || ''}`} ref={containerRef}>
      {/* 触发芯片 */}
      <button
        className={`chat-composer-chip chat-composer-subtle-chip model-picker-trigger ${
          open ? 'is-active' : ''
        }`}
        type="button"
        aria-label="模型"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <ModelBrandIcon model={model} size={13} />
        <span className="model-picker-trigger-label" title={model}>
          {model}
        </span>
        <ChevronDown
          size={11}
          className={`chat-composer-chip-chevron model-picker-chevron ${open ? 'is-open' : ''}`}
        />
      </button>

      {/* 极简下拉浮层 */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="model-picker-dropdown is-right"
            role="menu"
            aria-label="模型"
            initial={reducedMotion ? false : { opacity: 0, scale: 0.96, y: 6 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: reducedMotion
                ? { duration: 0 }
                : { duration: 0.16, ease: [0.16, 1, 0.3, 1] }
            }}
            exit={{
              opacity: 0,
              scale: 0.96,
              y: 4,
              transition: reducedMotion
                ? { duration: 0 }
                : { duration: 0.1, ease: [0.4, 0, 0.2, 1] }
            }}
            onKeyDown={handleKeyDown}
          >
            {/* 顶部轻量搜索框 */}
            <div className="model-picker-search-bar">
              <Search size={13} className="model-picker-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="model-picker-search-input"
                placeholder="搜索模型或提供商..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setHighlightIndex(0)
                }}
              />
              {search ? (
                <button
                  type="button"
                  className="model-picker-search-clear"
                  onClick={() => {
                    setSearch('')
                    searchInputRef.current?.focus()
                  }}
                  title="清空"
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>

            {/* 模型列表 */}
            <div className="model-picker-list" ref={listRef}>
              {filteredModels.length === 0 ? (
                <div className="model-picker-empty">
                  <span>未找到匹配的模型</span>
                </div>
              ) : (
                Object.entries(groupedModels).map(([providerName, items]) => (
                  <div key={providerName} className="model-picker-group">
                    <div className="model-picker-group-title">{providerName}</div>
                    {items.map((item) => {
                      const isSelected = item.id === model
                      const globalIdx = filteredModels.indexOf(item)
                      const isHighlighted = globalIdx === highlightIndex

                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isSelected}
                          className={`model-picker-item ${isSelected ? 'is-selected' : ''} ${
                            isHighlighted ? 'is-highlighted' : ''
                          }`}
                          onClick={() => {
                            onChange(item.id)
                            onOpenChange(false)
                          }}
                          onMouseEnter={() => setHighlightIndex(globalIdx)}
                        >
                          <div className="model-picker-item-icon">
                            <ModelBrandIcon model={item.id} size={15} />
                          </div>

                          <div className="model-picker-item-content">
                            <div className="model-picker-item-title-row">
                              <span className="model-picker-item-name" title={item.id}>
                                {item.id}
                              </span>
                              {isSelected ? (
                                <Check size={13} className="model-picker-check-icon" />
                              ) : null}
                            </div>

                            <div className="model-picker-item-badges">
                              {item.isReasoning ? (
                                <span
                                  className="model-picker-badge is-reasoning"
                                  title="支持深度思考推理"
                                >
                                  <Brain size={10} />
                                  推理
                                </span>
                              ) : null}
                              {item.isVision ? (
                                <span
                                  className="model-picker-badge is-vision"
                                  title="支持图像与视觉分析"
                                >
                                  <Eye size={10} />
                                  视觉
                                </span>
                              ) : null}
                              {item.isFast ? (
                                <span className="model-picker-badge is-fast" title="轻量极速响应">
                                  <Zap size={10} />
                                  快速
                                </span>
                              ) : null}
                              <span className="model-picker-badge is-limit">
                                {formatTokenCount(item.contextLimit)}
                              </span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            {/* 底部信息条 */}
            <div className="model-picker-footer">
              <div className="model-picker-footer-limit">
                <span>上下文上限:</span>
                <strong>{currentContextLimit.toLocaleString()} tokens</strong>
              </div>
              <div className="model-picker-footer-hint">
                <kbd>Esc</kbd> 关闭
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
