import { ChevronRightIcon, type LucideIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { cn } from '@renderer/lib/utils'
import { take } from '../utils/range'
import { collapsePanel, ShimmerLabel, SwapLabel } from './surfaces'

export interface TimelineStep {
  verb: string
  chip: string
  icon: LucideIcon
  detail?: (open: boolean) => ReactNode
}

export interface TimelineStat {
  file: string
  added?: number
  removed?: number
}

export interface ToolTimelineProps {
  steps: readonly TimelineStep[]
  visibleSteps: number
  streaming: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  restingLabel: string
  activeLabel: string
  stats?: TimelineStat[]
  className?: string
}

export function ToolTimeline({
  steps,
  visibleSteps,
  streaming,
  open,
  onOpenChange,
  restingLabel,
  activeLabel,
  className
}: ToolTimelineProps): React.ReactNode {
  const [openSteps, setOpenSteps] = useState<ReadonlySet<number>>(() => new Set())

  const setStepOpen = (index: number, stepOpen: boolean): void => {
    setOpenSteps((prev) => {
      const next = new Set(prev)
      if (stepOpen) next.add(index)
      else next.delete(index)
      return next
    })
  }

  return (
    <Collapsible
      data-slot="tool-timeline"
      open={open}
      onOpenChange={onOpenChange}
      className={cn('w-full', className)}
    >
      <CollapsibleTrigger className="group/trigger text-foreground/55 hover:text-foreground/90 flex items-center gap-1.5 rounded-md py-0 text-[13.5px] transition-colors outline-none cursor-pointer">
        <ChevronRightIcon className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-open/trigger:rotate-90 group-data-panel-open/trigger:rotate-90 motion-reduce:transition-none" />
        <SwapLabel active={streaming ? 0 : 1} className="text-start tabular-nums">
          <ShimmerLabel active={streaming} className="relative inline-block leading-none">
            {activeLabel}
          </ShimmerLabel>
          <>{restingLabel}</>
        </SwapLabel>
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(collapsePanel, 'outline-none')}>
        <div className="flex flex-col gap-(--density-gap-inner) ps-4 pt-2.5">
          {take(steps, visibleSteps).map((step, index, shown) => {
            const Icon = step.icon
            const active = streaming && index === shown.length - 1
            const stepDetail = step.detail
            const stepOpen = openSteps.has(index)
            const key = `${index}-${step.chip}`

            const row = (
              <div className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-foreground/55 flex min-w-0 items-center gap-2 text-[13.5px] duration-300">
                <Icon className="text-foreground/35 size-3.5 shrink-0" />
                <ShimmerLabel
                  active={active}
                  className="relative inline-block leading-none whitespace-nowrap"
                >
                  {step.verb}
                </ShimmerLabel>
                <span className="text-foreground/90 min-w-0 truncate font-mono text-xs">
                  {step.chip}
                </span>
                {stepDetail !== undefined ? (
                  <ChevronRightIcon
                    className={cn(
                      'ms-auto size-3 shrink-0 opacity-40 transition-transform duration-200 motion-reduce:transition-none',
                      stepOpen && 'rotate-90 opacity-80'
                    )}
                  />
                ) : null}
              </div>
            )

            if (stepDetail === undefined) {
              return <div key={key}>{row}</div>
            }

            return (
              <Collapsible
                key={key}
                open={stepOpen}
                onOpenChange={(next) => setStepOpen(index, next)}
              >
                <CollapsibleTrigger className="w-full text-start outline-none cursor-pointer">
                  {row}
                </CollapsibleTrigger>
                <CollapsibleContent className={cn(collapsePanel, 'outline-none')}>
                  <div className="mt-(--density-gap-inner)">{stepDetail(stepOpen)}</div>
                </CollapsibleContent>
              </Collapsible>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
