import { Code2, FileText, Layers, Search, Shield, Terminal, UserCheck, Zap } from 'lucide-react'
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { SYSTEM_BUILTIN_EXPERTS } from '../../hub/hub-data'
import type { ExpertItem } from '../../hub/hub-types'

export interface ExpertPickerHandle {
  moveSelection(delta: number): void
  selectActive(): boolean
}

function getExpertIcon(iconName?: string): React.ReactNode {
  switch (iconName) {
    case 'Layers':
      return <Layers size={16} />
    case 'Code2':
      return <Code2 size={16} />
    case 'Terminal':
      return <Terminal size={16} />
    case 'FileText':
      return <FileText size={16} />
    case 'Shield':
      return <Shield size={16} />
    case 'Zap':
      return <Zap size={16} />
    default:
      return <UserCheck size={16} />
  }
}

export const ExpertPicker = forwardRef<
  ExpertPickerHandle,
  {
    query: string
    showSearchInput: boolean
    onQueryChange?: (query: string) => void
    onSelect: (expert: ExpertItem) => void
  }
>(function ExpertPicker({ query, showSearchInput, onQueryChange, onSelect }, ref): React.ReactNode {
  const [activeIndex, setActiveIndex] = useState(0)

  // 综合内置专家和本地保存的专家
  const allExperts = useMemo<ExpertItem[]>(() => {
    try {
      const stored = localStorage.getItem('mingyi:hub:custom-experts')
      if (stored) {
        const custom = JSON.parse(stored) as ExpertItem[]
        return [...SYSTEM_BUILTIN_EXPERTS, ...custom]
      }
    } catch {
      // ignore parsing error
    }
    return SYSTEM_BUILTIN_EXPERTS
  }, [])

  const filteredExperts = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allExperts
    return allExperts.filter(
      (expert) =>
        expert.name.toLowerCase().includes(q) ||
        expert.title.toLowerCase().includes(q) ||
        expert.description.toLowerCase().includes(q) ||
        expert.tags.some((tag) => tag.toLowerCase().includes(q))
    )
  }, [allExperts, query])

  function moveSelection(delta: number): void {
    setActiveIndex((current) => {
      if (filteredExperts.length === 0) return 0
      return (current + delta + filteredExperts.length) % filteredExperts.length
    })
  }

  function selectActive(): boolean {
    const expert = filteredExperts[activeIndex]
    if (!expert) return false
    onSelect(expert)
    return true
  }

  useImperativeHandle(ref, () => ({ moveSelection, selectActive }))

  return (
    <div
      className="chat-skill-picker chat-expert-picker"
      role="dialog"
      aria-label="选择专家"
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          moveSelection(event.key === 'ArrowDown' ? 1 : -1)
        } else if (event.key === 'Enter') {
          event.preventDefault()
          selectActive()
        }
      }}
    >
      {showSearchInput ? (
        <label className="chat-skill-search">
          <Search size={14} />
          <input
            value={query}
            autoFocus
            aria-label="搜索专家"
            placeholder="搜索专家名称、角色或技能..."
            onChange={(event) => {
              onQueryChange?.(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                moveSelection(event.key === 'ArrowDown' ? 1 : -1)
              } else if (event.key === 'Enter') {
                event.preventDefault()
                selectActive()
              }
            }}
          />
        </label>
      ) : null}
      <div className="chat-expert-results" role="listbox" aria-label="专家列表">
        {filteredExperts.length === 0 ? (
          <div className="chat-skill-empty">未找到匹配的专家</div>
        ) : (
          filteredExperts.map((expert, index) => {
            const isSelected = index === activeIndex
            return (
              <button
                key={expert.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`chat-expert-item${isSelected ? ' is-selected' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault()
                  onSelect(expert)
                }}
                onClick={() => onSelect(expert)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="chat-expert-item-icon">{getExpertIcon(expert.iconName)}</span>
                <span className="chat-expert-item-content">
                  <span className="chat-expert-item-header">
                    <strong>{expert.name}</strong>
                    <span className="chat-expert-item-title">{expert.title}</span>
                  </span>
                  <small className="chat-expert-item-desc">{expert.description}</small>
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
})
