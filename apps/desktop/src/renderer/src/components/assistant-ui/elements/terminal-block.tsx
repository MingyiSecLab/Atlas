import { CheckIcon, Loader2Icon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'
import { take } from '../utils/range'
import { mono, paper } from './surfaces'

export function TerminalBlock({
  command,
  lines,
  visibleCount,
  done,
  variant = 'paper',
  className,
  ...props
}: Omit<
  ComponentProps<'div'>,
  'children' | 'command' | 'lines' | 'visibleCount' | 'done' | 'variant'
> & {
  command: string
  lines: readonly string[]
  visibleCount: number
  done: boolean
  variant?: 'paper' | 'ink'
}): React.ReactNode {
  const ink = variant === 'ink'

  return (
    <div
      data-slot="terminal-block"
      className={cn(
        ink ? 'bg-foreground dark:bg-popover' : paper,
        'w-full overflow-hidden rounded-2xl font-mono text-[0.86em]',
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1.5 border-b border-border/40">
        <span
          className={cn(
            'min-w-0 truncate',
            ink ? 'text-background/90 dark:text-foreground/90' : 'text-foreground/90'
          )}
          title={command}
        >
          {command}
        </span>
        {done ? (
          <div className="flex shrink-0 items-center gap-1">
            <CheckIcon className="size-3 text-emerald-500" />
            <span
              className={cn(
                mono,
                ink ? 'text-background/40 dark:text-foreground/40' : 'text-foreground/40'
              )}
            >
              exit 0
            </span>
          </div>
        ) : (
          <Loader2Icon
            className={cn(
              'size-3 shrink-0 animate-spin motion-reduce:animate-none',
              ink ? 'text-background/35 dark:text-foreground/35' : 'text-foreground/35'
            )}
          />
        )}
      </div>
      <div
        className={cn(
          'flex min-h-[5rem] max-h-72 overflow-y-auto flex-col gap-1 px-4 pt-2 pb-3.5',
          ink ? 'text-background/80 dark:text-foreground/75' : 'text-foreground/80'
        )}
      >
        {take(lines, visibleCount).map((line, i) => {
          const isLast = i === lines.length - 1
          return (
            <div
              key={`${i}-${line}`}
              className={cn(
                'fade-in animate-in fill-mode-both break-words whitespace-pre-wrap duration-300',
                isLast &&
                  (ink ? 'text-background/90 dark:text-foreground/90' : 'text-foreground/90')
              )}
            >
              {line}
            </div>
          )
        })}
        {!done && (
          <span
            aria-hidden
            className="inline-block h-3 w-1.5 animate-pulse bg-blue-500/70 motion-reduce:animate-none dark:bg-blue-400/70"
          />
        )}
      </div>
    </div>
  )
}
