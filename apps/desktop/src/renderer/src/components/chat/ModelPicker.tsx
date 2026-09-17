import React, { useState, useRef, useMemo, useCallback } from 'react'
import { ChevronDown, Search, Check, Brain, Eye, Zap, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
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

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setSearch('')
        const currentIndex = modelsWithMeta.findIndex((m) => m.id === model)
        setHighlightIndex(currentIndex >= 0 ? currentIndex : 0)
        setTimeout(() => {
          searchInputRef.current?.focus()
        }, 50)
      }
      onOpenChange(nextOpen)
    },
    [modelsWithMeta, model, onOpenChange]
  )

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

  const cleanModelLabel = useMemo(() => {
    if (!model) return '选择模型'
    if (model.includes('/')) {
      const parts = model.split('/')
      return parts[parts.length - 1]
    }
    return model
  }, [model])

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex h-7 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 hover:bg-muted px-2.5 text-xs font-medium text-foreground/85 transition-colors active:scale-95 cursor-pointer select-none ${
            open ? 'bg-muted ring-1 ring-primary/30' : ''
          } ${className || ''}`}
          type="button"
          aria-label="模型"
          aria-expanded={open}
        >
          <ModelBrandIcon model={model} size={13} />
          <span className="max-w-[130px] truncate text-[11.5px]" title={model}>
            {cleanModelLabel}
          </span>
          <ChevronDown
            size={11}
            className={`text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={6}
        className="w-80 rounded-2xl border border-border/80 bg-popover p-0 text-popover-foreground shadow-xl backdrop-blur-md z-50 outline-none overflow-hidden select-none"
        role="menu"
        aria-label="模型"
        onKeyDown={handleKeyDown}
      >
        <div ref={containerRef} className="flex flex-col">
          {/* 顶部轻量搜索框 */}
          <div className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-3 py-2 text-xs">
            <Search size={13} className="text-muted-foreground shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
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
                className="size-4 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground cursor-pointer"
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
          <div className="max-h-72 overflow-y-auto p-1.5" ref={listRef}>
            {filteredModels.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                <span>未找到匹配的模型</span>
              </div>
            ) : (
              Object.entries(groupedModels).map(([providerName, items]) => (
                <div key={providerName} className="mb-2 last:mb-0">
                  <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
                    {providerName}
                  </div>
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
                        className={`group relative flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-accent text-accent-foreground font-medium'
                            : isHighlighted
                              ? 'bg-muted/70 text-foreground'
                              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        }`}
                        onClick={() => {
                          onChange(item.id)
                          onOpenChange(false)
                        }}
                        onMouseEnter={() => setHighlightIndex(globalIdx)}
                      >
                        <div className="mt-0.5 shrink-0">
                          <ModelBrandIcon model={item.id} size={15} />
                        </div>

                        <div className="flex flex-1 flex-col gap-1 min-w-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <span
                              className="truncate text-xs text-foreground font-medium"
                              title={item.id}
                            >
                              {item.id}
                            </span>
                            {isSelected ? (
                              <Check size={13} className="text-primary shrink-0" />
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-1">
                            {item.isReasoning ? (
                              <span
                                className="inline-flex items-center gap-0.5 rounded-md bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-medium text-purple-600 dark:text-purple-400"
                                title="支持深度思考推理"
                              >
                                <Brain size={9} />
                                推理
                              </span>
                            ) : null}
                            {item.isVision ? (
                              <span
                                className="inline-flex items-center gap-0.5 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-600 dark:text-blue-400"
                                title="支持图像与视觉分析"
                              >
                                <Eye size={9} />
                                视觉
                              </span>
                            ) : null}
                            {item.isFast ? (
                              <span
                                className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400"
                                title="轻量极速响应"
                              >
                                <Zap size={9} />
                                快速
                              </span>
                            ) : null}
                            <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
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
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <span>上限:</span>
              <strong className="font-mono text-foreground">
                {currentContextLimit.toLocaleString()}
              </strong>
            </div>
            <div className="text-[10px] text-muted-foreground/60">
              <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[9px]">
                Esc
              </kbd>{' '}
              关闭
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
