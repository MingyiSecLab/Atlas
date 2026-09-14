/**
 * Range normalization for the numeric props the elements take.
 */

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function take<T>(items: readonly T[], count: number): T[] {
  return items.slice(0, Math.floor(clamp(count, 0, items.length)))
}

export function indexIn<T>(items: readonly T[], index: number): number {
  return Math.floor(clamp(index, 0, Math.max(0, items.length - 1)))
}

export function at<T>(items: readonly T[], index: number): T | undefined {
  if (items.length === 0) return undefined
  return items[indexIn(items, index)]
}

export function pct(value: number, total: number): number {
  if (!(total > 0)) return 0
  return clamp((value / total) * 100, 0, 100)
}

export function announced(share: number): number {
  return Math.round(share * 10) / 10
}

export function progressOf(index: number, total: number): number {
  if (!(total > 0)) return 0
  return Math.floor(clamp(index, 0, total))
}
