import React from 'react'
import { RotateCcw, Square, X } from 'lucide-react'

export interface StoppedRunCardProps {
  onRetry?: () => void
  onDismiss?: () => void
  message?: string
}

export const StoppedRunCard: React.FC<StoppedRunCardProps> = ({
  onRetry,
  onDismiss,
  message = '任务已由用户手动停止'
}) => {
  return (
    <div
      role="status"
      aria-label="执行已被用户中止"
      className="my-3 flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-150"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground/80">
          <Square size={10} fill="currentColor" />
        </span>
        <span className="truncate text-foreground/85 font-medium">{message}</span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {onRetry && (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border/60 bg-card px-2.5 text-xs font-medium text-foreground shadow-2xs hover:bg-accent transition-colors cursor-pointer"
            onClick={onRetry}
            title="重新尝试执行该轮任务"
          >
            <RotateCcw size={12} />
            <span>重试</span>
          </button>
        )}

        {onDismiss && (
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            onClick={onDismiss}
            title="忽略该提示"
            aria-label="关闭"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
