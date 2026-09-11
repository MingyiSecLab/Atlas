import type { RuntimeSkillInfo } from '@mingyi/runtime'
import { BookOpen, LoaderCircle, Search } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

export interface SkillPickerHandle {
  moveSelection(delta: number): void
  selectActive(): boolean
}

export const SkillPicker = forwardRef<
  SkillPickerHandle,
  {
    sessionId: string
    query: string
    showSearchInput: boolean
    onQueryChange?: (query: string) => void
    onSelect: (skill: RuntimeSkillInfo) => void
  }
>(function SkillPicker(
  { sessionId, query, showSearchInput, onQueryChange, onSelect },
  ref
): React.ReactNode {
  const [skills, setSkills] = useState<RuntimeSkillInfo[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  function moveSelection(delta: number): void {
    setActiveIndex((current) => {
      if (skills.length === 0) return 0
      return (current + delta + skills.length) % skills.length
    })
  }

  function selectActive(): boolean {
    const skill = skills[activeIndex]
    if (!skill) return false
    onSelect(skill)
    return true
  }

  useImperativeHandle(ref, () => ({ moveSelection, selectActive }))

  useEffect(() => {
    const request = ++requestRef.current
    const timer = window.setTimeout(
      () => {
        setIsLoading(true)
        setError(null)
        const operation = query.trim()
          ? window.api.skills
              .search({ sessionId, query: query.trim(), topK: 12 })
              .then((results) =>
                results.map(({ name, path, description }) => ({ name, path, description }))
              )
          : window.api.skills.list({ sessionId })
        void operation.then(
          (next) => {
            if (request !== requestRef.current) return
            setSkills(next)
            setActiveIndex(0)
            setIsLoading(false)
          },
          (searchError: unknown) => {
            if (request !== requestRef.current) return
            setSkills([])
            setActiveIndex(0)
            setError(searchError instanceof Error ? searchError.message : String(searchError))
            setIsLoading(false)
          }
        )
      },
      query.trim() ? 140 : 0
    )
    return () => window.clearTimeout(timer)
  }, [query, sessionId])

  return (
    <div
      className="chat-skill-picker"
      role="dialog"
      aria-label="选择 Skill"
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
            aria-label="搜索 Skills"
            placeholder="搜索名称、描述或内容"
            onChange={(event) => onQueryChange?.(event.currentTarget.value)}
          />
        </label>
      ) : (
        <div className="chat-skill-picker-query">
          <Search size={13} />
          <span>{query ? `搜索 “${query}”` : '可用 Skills'}</span>
        </div>
      )}
      <div className="chat-skill-results" role="listbox" aria-label="Skills">
        {isLoading ? (
          <div className="chat-skill-empty" role="status">
            <LoaderCircle size={14} className="is-spinning" />
            <span>正在搜索…</span>
          </div>
        ) : error ? (
          <div className="chat-skill-empty is-error" role="alert">
            {error}
          </div>
        ) : skills.length === 0 ? (
          <div className="chat-skill-empty">没有匹配的 Skill</div>
        ) : (
          skills.map((skill, index) => (
            <button
              className={index === activeIndex ? 'is-selected' : undefined}
              key={skill.path}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelect(skill)}
            >
              <BookOpen size={15} />
              <span>
                <strong>{skill.name}</strong>
                <small>{skill.description}</small>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
})
