'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react'
import { useAuiState, useThreadViewport, type ThreadMessage } from '@assistant-ui/react'
import { cn } from '@renderer/lib/utils'
import { ConversationMap, type ConversationMapEntry } from './conversation-map'

const TITLE_LENGTH = 72
const PREVIEW_LENGTH = 240

/**
 * A message scrolled to the top of the viewport lands a fraction of a pixel
 * below it, which would otherwise hand the active tick to the turn before.
 */
const TOP_TOLERANCE = 1

const sameIds = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * The line a message has to cross to count as the one being read. It sits at
 * the top of the viewport for most of a thread, then slides to the bottom
 * across the final screenful: a message that starts within one viewport height
 * of the end can never reach the top, so a fixed line leaves the last screen's
 * worth of ticks permanently unreachable.
 */
const readingLine = (viewport: HTMLElement): number => {
  const rect = viewport.getBoundingClientRect()
  const height = viewport.clientHeight
  if (height <= 0) return rect.top + TOP_TOLERANCE

  const remaining = viewport.scrollHeight - height - viewport.scrollTop
  const descent = Math.min(1, Math.max(0, (height - remaining) / height))
  return rect.top + rect.height * descent + TOP_TOLERANCE
}

const partsOf = (message: ThreadMessage): ThreadMessage['content'] => [...message.content]

const textOf = (message: ThreadMessage): string =>
  partsOf(message)
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n')
    .trim()

const labelOf = (message: ThreadMessage): string => {
  const parts = partsOf(message)
  const tools = parts.flatMap((part) => (part.type === 'tool-call' ? [part.toolName] : []))
  if (tools.length === 1) return tools[0]
  if (tools.length > 1) return `${tools.length} tool calls`
  if (parts.some((part) => part.type === 'reasoning')) return 'Reasoning'

  // A composer submission carries its files in `attachments` and leaves
  // `content` empty, so both places decide an attachment-only turn's label.
  const carriers = [...parts, ...(message.attachments ?? [])]
  if (carriers.some((carrier) => carrier.type === 'image')) return 'Image'
  if (carriers.some((carrier) => carrier.type === 'file')) return 'File'
  if (carriers.length > 0) return 'Attachment'
  return message.role === 'user' ? 'Message' : 'Response'
}

/** Cuts on a word boundary so a title never splits a word. */
const cutAtWord = (text: string, limit: number): string => {
  if (text.length <= limit) return text
  const head = text.slice(0, limit)
  const boundary = head.lastIndexOf(' ')
  return boundary > limit / 2 ? head.slice(0, boundary) : head
}

const linesOf = (message: ThreadMessage): string[] =>
  textOf(message)
    .split('\n')
    .map((line) => line.replace(/^[\s#>*`-]+/, '').trim())
    .filter(Boolean)

/** A user message and the assistant messages answering it. */
type Turn = {
  head: ThreadMessage
  members: ThreadMessage[]
}

const groupIntoTurns = (messages: readonly ThreadMessage[]): Turn[] => {
  const turns: Turn[] = []

  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue

    const current = turns.at(-1)
    if (message.role === 'user' || !current) {
      turns.push({ head: message, members: [message] })
      continue
    }
    current.members.push(message)
  }

  return turns
}

const describe = ({ head, members }: Turn): ConversationMapEntry => {
  const lines = linesOf(head)
  const first = lines[0] ?? ''
  const title = cutAtWord(first, TITLE_LENGTH)

  // What the turn asked names it; what it answered is the useful preview, and
  // a turn still being answered falls back to the rest of its own text.
  const answer = members.find((member) => member !== head && textOf(member))
  const preview = (
    answer ? linesOf(answer).join(' ') : [first.slice(title.length), ...lines.slice(1)].join(' ')
  )
    .trim()
    .slice(0, PREVIEW_LENGTH)

  return {
    id: head.id,
    title: title || labelOf(head),
    ...(preview ? { preview } : {})
  }
}

export interface ConversationMapAuiProps {
  side?: 'left' | 'right'
  className?: string
}

export const ConversationMapAui: FC<ConversationMapAuiProps> = ({ side = 'left', className }) => {
  const railRef = useRef<HTMLDivElement>(null)
  const messages = useAuiState((s) => s.thread.messages)
  const contextViewport = useThreadViewport((s) => s.element.viewport)
  const contextViewportHeight = useThreadViewport((s) => s.height.viewport)
  const [domViewport, setDomViewport] = useState<HTMLElement | null>(null)
  const [viewportHeight, setViewportHeight] = useState(0)

  /**
   * 挂载期的 effect 在这里必然失效：首屏会话还没加载完，`entries.length < 2`
   * 让组件返回 null，effect 只能读到空 ref，而它的依赖（contextViewport）之后
   * 再也不会变，于是永远不重跑。后果是高度停在 `100%`，父级却是 `h-0` 的 sticky
   * 盒子 —— 刻度全部被压到视口顶端裁掉，导轨等于从未出现过。
   * 换成 ref 回调：节点只要出现就会被捕获，之后卸载重挂也算数。
   */
  const attachRail = useCallback(
    (node: HTMLDivElement | null) => {
      railRef.current = node
      if (!node || contextViewport) return
      const found =
        node.closest<HTMLElement>('.chat-scroll') ??
        node.closest<HTMLElement>('[data-markdown-scroll-container]')?.parentElement ??
        (node.parentElement as HTMLElement | null)
      setDomViewport((previous) => (previous === found ? previous : found))
      setViewportHeight(found?.clientHeight ?? 0)
    },
    [contextViewport]
  )

  const viewport = contextViewport ?? domViewport

  // 窗口缩放、右能力面板开合都会改滚动视口高度。没有这个观察器，高度只会在
  // 别的原因触发的重渲染里偶然刷新，刻度会停在旧尺寸算出的中心点上。
  useEffect(() => {
    if (!viewport) return undefined
    const observer = new ResizeObserver(() => setViewportHeight(viewport.clientHeight))
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [viewport])

  const resolvedHeight = contextViewportHeight
    ? `${contextViewportHeight}px`
    : viewportHeight
      ? `${viewportHeight}px`
      : '100%'

  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const [visibleIds, setVisibleIds] = useState<readonly string[]>([])
  const scheduleRef = useRef<(() => void) | undefined>(undefined)

  const turns = useMemo(() => groupIntoTurns(messages), [messages])
  const entries = useMemo(() => turns.map(describe), [turns])

  /** Which turn each message belongs to, so a message in view marks its turn. */
  const turnOf = useMemo(() => {
    const owners = new Map<string, string>()
    for (const turn of turns) {
      for (const member of turn.members) owners.set(member.id, turn.head.id)
    }
    return owners
  }, [turns])

  const turnOfRef = useRef(turnOf)
  const turnKey = turns.map((turn) => turn.head.id).join(' ')

  useEffect(() => {
    turnOfRef.current = turnOf
  })

  useEffect(() => {
    if (!viewport) return undefined

    let frame = 0
    const measure = (): void => {
      frame = 0
      const owners = turnOfRef.current
      const view = viewport.getBoundingClientRect()
      const line = readingLine(viewport)

      // One pass yields both facts the rail draws: which turn is being read,
      // and which turns the viewport currently holds.
      let current: string | undefined
      const onScreen: string[] = []
      for (const element of viewport.querySelectorAll<HTMLElement>('[data-message-id]')) {
        const box = element.getBoundingClientRect()
        if (box.top >= view.bottom) break

        const id = element.dataset['messageId']
        const head = id === undefined ? undefined : owners.get(id)
        if (head === undefined) continue

        if (box.top <= line) current = head
        if (box.bottom > view.top && !onScreen.includes(head)) {
          onScreen.push(head)
        }
      }

      setActiveId(current ?? owners.values().next().value)
      setVisibleIds((previous) => (sameIds(previous, onScreen) ? previous : onScreen))
    }
    const schedule = (): void => {
      if (frame) return
      frame = requestAnimationFrame(measure)
    }

    scheduleRef.current = schedule
    schedule()
    viewport.addEventListener('scroll', schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(viewport)

    return () => {
      scheduleRef.current = undefined
      if (frame) cancelAnimationFrame(frame)
      viewport.removeEventListener('scroll', schedule)
      observer.disconnect()
    }
  }, [viewport])

  useEffect(() => {
    scheduleRef.current?.()
  }, [turnKey])

  const select = useCallback(
    (id: string) => {
      if (!viewport) return
      for (const element of viewport.querySelectorAll<HTMLElement>('[data-message-id]')) {
        if (element.dataset['messageId'] !== id) continue

        // `scrollIntoView` aligns every scrollable ancestor, which drags the
        // page a thread is embedded in; only this viewport should move.
        const top =
          element.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top +
          viewport.scrollTop
        viewport.scrollTo({ top, behavior: 'smooth' })
        return
      }
    },
    [viewport]
  )

  if (entries.length < 2) return null

  return (
    <div
      ref={attachRail}
      data-slot="conversation-map-rail"
      className={cn('pointer-events-none sticky top-0 z-10 h-0 w-full', className)}
    >
      <div
        className={cn(
          'pointer-events-auto absolute top-0',
          side === 'right' ? 'right-0' : 'left-0'
        )}
        // 留白写成内联样式而不是 px-3 py-10：历史原因是 main.css 的无层
        // `* { margin/padding: 0 }` 会吃掉 Tailwind 的 @layer utilities（该重置
        // 现已移入 @layer base，工具类恢复生效）。这里仍保留内联样式，是为了
        // 让留白与高度写在一起、避免与 JS 计算的高度各漂移一处。
        // 若要换成工具类，需确认计算值一致（padding: 40px 12px = py-10 px-3）。
        style={{ height: resolvedHeight, padding: '40px 12px' }}
      >
        <ConversationMap
          entries={entries}
          activeId={activeId}
          visibleIds={visibleIds}
          onSelect={select}
          side={side === 'right' ? 'left' : 'right'}
        />
      </div>
    </div>
  )
}
