import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import { mono, ShimmerLabel } from './surfaces'

export function ThinkingIndicator({
  label,
  elapsed,
  icon,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'children' | 'label' | 'elapsed'> & {
  label: string
  elapsed?: string
  icon?: ReactNode
}): React.ReactNode {
  return (
    <div
      data-slot="thinking-indicator"
      role="status"
      aria-live="polite"
      className={cn('text-foreground/55 flex items-center gap-2.5 text-sm py-1.5', className)}
      {...props}
    >
      {icon ?? (
        <span
          aria-hidden
          className="size-1.5 shrink-0 animate-pulse rounded-full bg-blue-500 motion-reduce:animate-none dark:bg-blue-400"
        />
      )}
      <span
        key={label}
        className="fade-in slide-in-from-bottom-1 animate-in relative inline-block leading-none duration-300"
      >
        <ShimmerLabel>{label}</ShimmerLabel>
      </span>
      {elapsed !== undefined && (
        <span className={cn(mono, 'text-foreground/40 text-xs tabular-nums font-mono')}>
          {elapsed}
        </span>
      )}
    </div>
  )
}
