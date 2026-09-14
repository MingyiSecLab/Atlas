export type TimeInput = number | Date | string

/** 同一自然日（按本地时区） */
export function isSameDay(a: TimeInput, b: TimeInput): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

/** 与今天相差的自然日数：0=今天，1=昨天，负数=未来 */
export function dayOffset(timestamp: TimeInput, now: TimeInput = Date.now()): number {
  const startOfDay = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((startOfDay(new Date(now)) - startOfDay(new Date(timestamp))) / 86_400_000)
}

/** 距今相对日期：今天 / 昨天 / M月D日（跨年带年份） */
export function formatRelativeDay(timestamp: TimeInput, now: TimeInput = Date.now()): string {
  const date = new Date(timestamp)
  const diffDays = dayOffset(timestamp, now)
  if (diffDays <= 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (date.getFullYear() !== new Date(now).getFullYear()) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/** HH:mm 格式化 */
export function formatTime(timestamp: TimeInput): string {
  try {
    const d = new Date(timestamp)
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  } catch {
    return ''
  }
}
