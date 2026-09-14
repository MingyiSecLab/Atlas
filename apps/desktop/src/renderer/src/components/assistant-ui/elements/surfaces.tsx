import type { ComponentProps } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@renderer/lib/utils'

export const paper = 'bg-background border border-border/60 dark:bg-popover'

export const floating = 'bg-background border border-border/60 dark:bg-popover'

export const field = 'bg-foreground/[0.04] dark:bg-foreground/[0.06]'

export const fieldInteractive =
  'bg-foreground/[0.04] transition-colors hover:bg-foreground/[0.07] dark:bg-foreground/[0.06] dark:hover:bg-foreground/[0.09]'

export const pressable =
  'transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.96] motion-reduce:transition-none'

export const ghostButton =
  'flex items-center justify-center rounded-full text-foreground/45 outline-none transition-[background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 active:scale-[0.96] focus-visible:ring-1 focus-visible:ring-foreground/20 motion-reduce:transition-none dark:hover:bg-foreground/[0.09]'

export const inkButton =
  'bg-foreground text-background transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:opacity-90 active:scale-[0.96] motion-reduce:transition-none'

export const iconSwap =
  '[grid-area:1/1] transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none'

export const iconSwapIn = 'scale-100 opacity-100 blur-none'

export const iconSwapOut = 'scale-[0.25] opacity-0 blur-[4px]'

export const labelSwap =
  'col-start-1 row-start-1 flex w-max items-center gap-1.5 leading-none transition-[opacity,filter] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none'

export const labelSwapIn = 'opacity-100 blur-none'

export const labelSwapOut = 'pointer-events-none select-none opacity-0 blur-[2px]'

export const collapsePanel =
  'overflow-hidden data-open:animate-collapsible-down data-closed:animate-collapsible-up data-closed:fill-mode-forwards data-closed:pointer-events-none motion-reduce:animate-none'

export const live = 'text-blue-500 dark:text-blue-400'

export const mono = 'font-mono text-[11px] tracking-tight'

export function ShimmerLabel({
  active = true,
  className,
  ...props
}: ComponentProps<'span'> & { active?: boolean }): React.ReactNode {
  return (
    <span className={cn(active && 'shimmer motion-reduce:animate-none', className)} {...props} />
  )
}

export const codeScroll = 'overflow-x-auto'

export const codeSurface = 'w-max min-w-full'

export function SwapLabel({
  active,
  children,
  className
}: {
  active: 0 | 1
  children: [React.ReactNode, React.ReactNode]
  className?: string
}): React.ReactNode {
  const layer0Ref = useRef<HTMLSpanElement>(null)
  const layer1Ref = useRef<HTMLSpanElement>(null)
  const [width, setWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const target = active === 0 ? layer0Ref.current : layer1Ref.current
    if (!target) return undefined
    const measure = (): void => setWidth(Math.ceil(target.getBoundingClientRect().width))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(target)
    return () => observer.disconnect()
  }, [active])

  return (
    <span
      style={width === null ? undefined : { width }}
      className={cn(
        'grid overflow-x-clip transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
        className
      )}
    >
      <span
        ref={layer0Ref}
        aria-hidden={active !== 0}
        className={cn(labelSwap, active === 0 ? labelSwapIn : labelSwapOut)}
      >
        {children[0]}
      </span>
      <span
        ref={layer1Ref}
        aria-hidden={active !== 1}
        className={cn(labelSwap, active === 1 ? labelSwapIn : labelSwapOut)}
      >
        {children[1]}
      </span>
    </span>
  )
}
