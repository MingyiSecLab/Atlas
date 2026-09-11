import { useEffect, useRef, useState } from 'react'

export function useCopyFeedback(timeout = 2000): {
  copied: boolean
  copy: (value: string) => void
} {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  const copy = (value: string): void => {
    navigator.clipboard.writeText(value).catch(() => undefined)
    setCopied(true)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setCopied(false), timeout)
  }

  return { copied, copy }
}
