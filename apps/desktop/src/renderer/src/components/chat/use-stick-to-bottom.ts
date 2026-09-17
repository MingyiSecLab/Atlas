import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'

/** 距底部多少像素内算「在底部」 */
export const STICK_THRESHOLD_PX = 12

/** 滚到最底部之后等多久恢复跟随；期间用户再上滑就作废 */
export const STICK_RESUME_DELAY_MS = 180

/** 距底部的像素数（内容不满一屏时为 0） */
export function distanceFromBottom(box: {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}): number {
  return Math.max(0, box.scrollHeight - box.scrollTop - box.clientHeight)
}

export interface StickScrollSample {
  previousScrollTop: number | null
  scrollTop: number
  distance: number
  following: boolean
}

export interface StickScrollDecision {
  following: boolean
  scheduleResume: boolean
}

/**
 * 一次滚动事件之后的跟随判定（纯状态机）。
 * 判定顺序：先看方向，再看距离。向上滑立刻停跟随，彻底防止流式期间抢占用户视线。
 */
export function nextStickState(sample: StickScrollSample): StickScrollDecision {
  const { previousScrollTop, scrollTop, distance, following } = sample

  // 1. 向上滑：立刻停跟随，并且作废待恢复
  if (previousScrollTop !== null && scrollTop < previousScrollTop) {
    return { following: false, scheduleResume: false }
  }

  // 2. 不在底部：保持「不跟随」，也不排恢复（只有真正触底才恢复）
  if (distance > STICK_THRESHOLD_PX) return { following: false, scheduleResume: false }

  // 3. 到底了：已在跟随就什么都不做；否则稍候片刻再恢复
  return { following, scheduleResume: !following }
}

/**
 * 把智能贴底跟随挂到对话视口容器上。
 */
export interface UseStickToBottomOptions {
  threshold?: number
  autoScroll?: boolean
}

export interface UseStickToBottomReturn {
  scrollRef: RefObject<HTMLDivElement | null>
  isAtBottom: boolean
  scrollToBottom: (behavior?: ScrollBehavior) => void
}

export function useStickToBottom(options: UseStickToBottomOptions = {}): UseStickToBottomReturn {
  const { threshold = STICK_THRESHOLD_PX } = options
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const followingRef = useRef(true)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const lastScrollTopRef = useRef<number | null>(null)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frameRef = useRef<number | null>(null)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const viewport = scrollRef.current
    if (!viewport) return
    followingRef.current = true
    setIsAtBottom(true)
    viewport.scrollTo({ top: viewport.scrollHeight, behavior })
  }, [])

  useEffect(() => {
    const viewport = scrollRef.current
    if (viewport === null) return undefined

    const cancelResume = (): void => {
      if (resumeTimerRef.current === null) return
      clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = null
    }

    /** 跟随中：内容变高就把视口贴到底 */
    const stick = (): void => {
      if (!followingRef.current) return
      viewport.scrollTop = viewport.scrollHeight
      lastScrollTopRef.current = viewport.scrollTop
    }

    /**
     * 流式输出每来一个 token 都会改 DOM，用 rAF 合并，避免强制同步重排
     */
    const scheduleStick = (): void => {
      if (frameRef.current !== null) return
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        stick()
      })
    }

    const handleScroll = (): void => {
      const distance = distanceFromBottom(viewport)
      const atBottomNow = distance <= threshold
      setIsAtBottom(atBottomNow)

      const decision = nextStickState({
        previousScrollTop: lastScrollTopRef.current,
        scrollTop: viewport.scrollTop,
        distance,
        following: followingRef.current
      })
      lastScrollTopRef.current = viewport.scrollTop

      if (!decision.scheduleResume) cancelResume()
      followingRef.current = decision.following
      if (!decision.scheduleResume) return

      resumeTimerRef.current = setTimeout(() => {
        resumeTimerRef.current = null
        if (distanceFromBottom(viewport) > threshold) return
        followingRef.current = true
      }, STICK_RESUME_DELAY_MS)
    }

    const observer = new MutationObserver(scheduleStick)

    viewport.addEventListener('scroll', handleScroll, { passive: true })
    observer.observe(viewport, { childList: true, subtree: true, characterData: true })

    return () => {
      cancelResume()
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      viewport.removeEventListener('scroll', handleScroll)
      observer.disconnect()
      followingRef.current = true
      lastScrollTopRef.current = null
    }
  }, [threshold])

  return { scrollRef, isAtBottom, scrollToBottom }
}
