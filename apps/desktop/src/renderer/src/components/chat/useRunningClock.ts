import { useCallback, useSyncExternalStore } from 'react'

const SECOND_MS = 1000

/** 秒级切片：同一秒内恒定，跨秒时变化（用作 useSyncExternalStore 的快照） */
function currentSecond(): number {
  return Math.floor(Date.now() / SECOND_MS)
}

function subscribeSecond(onStoreChange: () => void): () => void {
  const timer = setInterval(onStoreChange, SECOND_MS)
  return () => clearInterval(timer)
}

const noopUnsubscribe = (): void => {}

/**
 * 运行时钟：active 期间每秒推进一次的绝对时间戳（毫秒），未运行时返回 null。
 *
 * 用绝对时间戳而非"已运行秒数"，是为了让同一时刻的多个消费者（分组总耗时、
 * 当前步骤耗时）共享同一个基准，不必各自起定时器。
 *
 * 走 useSyncExternalStore 而非 effect + state：时间本身是 React 之外的外部状态，
 * 由订阅回调驱动重渲染既符合该 API 的语义，也避免了在 effect 里同步 setState
 * 造成的级联渲染；未运行时退化为空订阅，不会空转。时间戳按秒取整，与整秒粒度
 * 的展示完全一致。
 */
export function useRunningClock(active: boolean): number | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) => (active ? subscribeSecond(onStoreChange) : noopUnsubscribe),
    [active]
  )

  const second = useSyncExternalStore(subscribe, currentSecond, currentSecond)

  return active ? second * SECOND_MS : null
}

/**
 * 整秒粒度的耗时文案：<60s 用 "12s"，≥60s 用 "2m 05s"。
 * 与 formatElapsedMs 的区别是不带毫秒小数，避免秒级刷新时数字抖动。
 */
export function formatLiveElapsedMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / SECOND_MS))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}
