/* eslint-disable react-refresh/only-export-components */
import { cva, type VariantProps } from 'class-variance-authority'
import { BrainIcon, ChevronDownIcon } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { cn } from '@renderer/lib/utils'

export const ANIMATION_DURATION = 200

const ReasoningPreviewContext = createContext(false)

const reasoningVariants = cva('aui-reasoning-root w-full', {
  variants: {
    variant: {
      outline: 'rounded-lg border px-3 py-2',
      ghost: '',
      muted: 'bg-muted/50 rounded-lg px-3 py-2'
    }
  },
  defaultVariants: {
    variant: 'outline'
  }
})

export type ReasoningRootProps = Omit<
  React.ComponentProps<typeof Collapsible>,
  'open' | 'onOpenChange'
> &
  VariantProps<typeof reasoningVariants> & {
    open?: boolean
    onOpenChange?: (open: boolean) => void
    defaultOpen?: boolean
    streaming?: boolean
    onAnimationStart?: () => void
  }

function ReasoningRoot({
  className,
  variant,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  streaming,
  onAnimationStart,
  children,
  ...props
}: ReasoningRootProps): React.ReactNode {
  const [initialOpen] = useState(defaultOpen)
  const [userOpen, setUserOpen] = useState<boolean | null>(null)

  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : (userOpen ?? (streaming || initialOpen))
  const isPreview = streaming === true && isOpen

  const prevStreamingRef = useRef(streaming)
  useLayoutEffect(() => {
    if (prevStreamingRef.current === streaming) return
    prevStreamingRef.current = streaming
    if (!isControlled && userOpen === null && !initialOpen) {
      onAnimationStart?.()
    }
  }, [streaming, isControlled, userOpen, initialOpen, onAnimationStart])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      onAnimationStart?.()
      if (!isControlled) {
        setUserOpen(open)
      }
      controlledOnOpenChange?.(open)
    },
    [onAnimationStart, isControlled, controlledOnOpenChange]
  )

  return (
    <Collapsible
      data-slot="reasoning-root"
      data-variant={variant}
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn('group/reasoning-root', reasoningVariants({ variant, className }))}
      style={
        {
          '--animation-duration': `${ANIMATION_DURATION}ms`
        } as React.CSSProperties
      }
      {...props}
    >
      <ReasoningPreviewContext.Provider value={isPreview}>
        {children}
      </ReasoningPreviewContext.Provider>
    </Collapsible>
  )
}

function ReasoningFade({
  side = 'bottom',
  className,
  ...props
}: React.ComponentProps<'div'> & { side?: 'top' | 'bottom' }): React.ReactNode {
  if (side === 'top') {
    return (
      <div
        data-slot="reasoning-fade"
        className={cn(
          'aui-reasoning-fade pointer-events-none absolute inset-x-0 top-0 z-10 h-8',
          'bg-[linear-gradient(to_bottom,var(--color-background),transparent)]',
          'group-data-[variant=muted]/reasoning-root:bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--color-muted)_50%,var(--color-background)),transparent)]',
          'fade-in-0 animate-in',
          'animation-duration-(--animation-duration)',
          className
        )}
        {...props}
      />
    )
  }

  return (
    <div
      data-slot="reasoning-fade"
      className={cn(
        'aui-reasoning-fade pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8',
        'bg-[linear-gradient(to_top,var(--color-background),transparent)]',
        'group-data-[variant=muted]/reasoning-root:bg-[linear-gradient(to_top,color-mix(in_oklab,var(--color-muted)_50%,var(--color-background)),transparent)]',
        'fade-in-0 animate-in',
        'animation-duration-(--animation-duration)',
        className
      )}
      {...props}
    />
  )
}

function ReasoningTrigger({
  active,
  duration,
  label = '深度思考',
  durationLabel,
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
  active?: boolean
  duration?: number
  label?: string
  durationLabel?: (seconds: number) => string
}): React.ReactNode {
  const text =
    duration !== undefined && duration > 0
      ? (durationLabel ?? ((seconds: number) => `${label} (${seconds}s)`))(duration)
      : label

  return (
    <CollapsibleTrigger
      data-slot="reasoning-trigger"
      className={cn(
        // ghost 触发行对齐 tests/linkcode chat/disclosure-header.tsx：
        // icon + 标签 + chevron 紧凑左对齐，仅文字色 hover 反馈，无背景无满宽
        'aui-reasoning-trigger group/trigger text-muted-foreground hover:text-foreground flex max-w-[75%] origin-left cursor-pointer items-center gap-2 py-1 text-left text-sm transition-[color,scale] active:scale-[0.98]',
        className
      )}
      {...props}
    >
      <BrainIcon
        data-slot="reasoning-trigger-icon"
        className="aui-reasoning-trigger-icon size-3.5 shrink-0"
      />
      <span
        data-slot="reasoning-trigger-label"
        className={cn(
          'aui-reasoning-trigger-label-wrapper inline-block font-medium leading-none opacity-80 tabular-nums',
          active && 'shimmer motion-reduce:animate-none'
        )}
      >
        {text}
      </span>
      <ChevronDownIcon
        data-slot="reasoning-trigger-chevron"
        className={cn(
          'aui-reasoning-trigger-chevron size-3.5 shrink-0',
          'transition-transform duration-(--animation-duration) ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
          '-rotate-90',
          'group-data-open/trigger:rotate-0',
          'group-data-panel-open/trigger:rotate-0'
        )}
      />
    </CollapsibleTrigger>
  )
}

function ReasoningContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>): React.ReactNode {
  const isPreview = useContext(ReasoningPreviewContext)

  return (
    <CollapsibleContent
      data-slot="reasoning-content"
      className={cn(
        'aui-reasoning-content text-muted-foreground relative overflow-hidden outline-none',
        'group/collapsible-content ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none',
        'data-closed:animate-collapsible-up',
        'data-open:animate-collapsible-down',
        'data-closed:fill-mode-forwards',
        'data-closed:pointer-events-none',
        '[--tw-duration:var(--animation-duration)]',
        className
      )}
      {...props}
    >
      <ReasoningFade side="top" />
      {children}
      {isPreview ? <ReasoningFade /> : null}
    </CollapsibleContent>
  )
}

function ReasoningText({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>): React.ReactNode {
  const isPreview = useContext(ReasoningPreviewContext)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isPreview) return
    const scrollEl = scrollRef.current
    const contentEl = contentRef.current
    if (!scrollEl || !contentEl) return

    let pinned = true
    let lastScrollTop = scrollEl.scrollTop
    let lastScrollHeight = scrollEl.scrollHeight
    const isAtBottom = (): boolean =>
      Math.abs(scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight) <= 1 ||
      scrollEl.scrollHeight <= scrollEl.clientHeight

    const pin = (): void => {
      if (!pinned) return
      scrollEl.scrollTop = scrollEl.scrollHeight
    }

    const onScroll = (): void => {
      if (isAtBottom()) {
        pinned = true
      } else if (scrollEl.scrollTop < lastScrollTop && scrollEl.scrollHeight === lastScrollHeight) {
        pinned = false
      }
      lastScrollTop = scrollEl.scrollTop
      lastScrollHeight = scrollEl.scrollHeight
    }

    pin()
    scrollEl.addEventListener('scroll', onScroll)
    const observer = new ResizeObserver(pin)
    observer.observe(contentEl)
    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [isPreview])

  return (
    <div
      ref={scrollRef}
      data-slot="reasoning-text"
      className={cn(
        // 内容区对齐 tests/linkcode chat/reasoning.tsx 的 ReasoningContent：
        // mt-1 + 左侧 2px 中性边线 + pl-3 缩进 + 斜体弱化，max-h-96 限高滚动
        'aui-reasoning-text relative z-0 mt-1 max-h-96 overflow-y-auto border-l-2 border-border pl-3 text-sm italic opacity-90 text-muted-foreground text-pretty',
        'transform-gpu transition-[transform,opacity] ease-[cubic-bezier(0.32,0.72,0,1)]',
        'motion-reduce:animate-none',
        'group-data-open/collapsible-content:animate-in',
        'group-data-closed/collapsible-content:animate-out',
        'group-data-open/collapsible-content:fade-in-0',
        'group-data-closed/collapsible-content:fade-out-0',
        'group-data-open/collapsible-content:slide-in-from-top-4',
        'group-data-closed/collapsible-content:slide-out-to-top-4',
        'group-data-open/collapsible-content:blur-in-[2px]',
        'group-data-closed/collapsible-content:blur-out-[2px]',
        'group-data-open/collapsible-content:animation-duration-(--animation-duration)',
        'group-data-closed/collapsible-content:animation-duration-(--animation-duration)',
        className
      )}
      {...props}
    >
      <div ref={contentRef} className="aui-reasoning-text-content space-y-(--density-gap)">
        {children}
      </div>
    </div>
  )
}

export {
  ReasoningContent,
  ReasoningFade,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
  reasoningVariants
}
