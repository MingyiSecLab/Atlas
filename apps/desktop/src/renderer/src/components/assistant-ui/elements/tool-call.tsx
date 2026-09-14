import { CheckIcon, ChevronRightIcon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { cn } from '@renderer/lib/utils'
import { collapsePanel, field, mono, ShimmerLabel, SwapLabel } from './surfaces'

export interface ToolCallProps {
  label: string
  activeLabel: string
  query: string
  request: string
  result: string
  running: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  detail?: ReactNode
  isError?: boolean
  className?: string
}

export function ToolCall({
  label,
  activeLabel,
  query,
  request,
  result,
  running,
  open,
  onOpenChange,
  detail,
  isError = false,
  className
}: ToolCallProps): React.ReactNode {
  return (
    <Collapsible
      data-slot="tool-call"
      open={open}
      onOpenChange={onOpenChange}
      className={cn('w-full', className)}
    >
      <CollapsibleTrigger
        className={cn(
          'group/trigger text-foreground/55 hover:text-foreground/90 flex items-center gap-2 rounded-md py-0 text-[13.5px] transition-colors outline-none cursor-pointer',
          isError &&
            'text-red-600/85 hover:text-red-600 dark:text-red-400/85 dark:hover:text-red-400'
        )}
      >
        <ChevronRightIcon className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-open/trigger:rotate-90 group-data-panel-open/trigger:rotate-90 motion-reduce:transition-none" />
        <SwapLabel active={running ? 0 : 1} className="text-start">
          <ShimmerLabel active={running} className="relative inline-block leading-none">
            {activeLabel}
          </ShimmerLabel>
          <>{label}</>
        </SwapLabel>
        {query && (
          <span
            className={cn(
              mono,
              'bg-foreground/[0.06] text-foreground/70 min-w-0 max-w-[260px] truncate rounded-md px-1.5 py-0.5'
            )}
          >
            {query}
          </span>
        )}
        <span className="ms-auto flex w-4 items-center justify-end">
          {!running &&
            (isError ? (
              <XIcon className="fade-in zoom-in-90 animate-in size-3.5 text-red-600 duration-200 dark:text-red-400" />
            ) : (
              <CheckIcon className="fade-in zoom-in-90 animate-in size-3.5 text-emerald-500 duration-200" />
            ))}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(collapsePanel, 'outline-none')}>
        {detail !== undefined ? (
          <div className="mt-(--density-gap-inner)">{detail}</div>
        ) : (
          <div
            className={cn(
              field,
              'mt-(--density-gap-inner) overflow-hidden rounded-2xl text-[0.86em]'
            )}
          >
            {request ? (
              <>
                <div className="px-3.5 pt-2.5 pb-2">
                  <p className={cn(mono, 'text-foreground/35 mb-1')}>入参</p>
                  <p className="text-foreground/55 font-mono break-all">{request}</p>
                </div>
                <div className="bg-foreground/[0.06] mx-3.5 h-px" />
              </>
            ) : null}
            <div className="px-3.5 pt-2 pb-2.5">
              <p className={cn(mono, 'text-foreground/35 mb-1')}>输出</p>
              <p className="text-foreground/90 font-mono whitespace-pre-wrap break-all">
                {result || '无输出'}
              </p>
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
