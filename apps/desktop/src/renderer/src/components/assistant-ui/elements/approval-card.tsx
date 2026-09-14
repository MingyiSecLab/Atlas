import { CheckIcon, Loader2Icon, ShieldAlertIcon, XIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'
import { field, inkButton, paper } from './surfaces'

export type ApprovalState = 'request' | 'running' | 'done' | 'denied'

export interface ApprovalCardLabels {
  allowOnce?: string
  alwaysAllow?: string
  deny?: string
  running?: string
}

const DEFAULT_LABELS: Required<ApprovalCardLabels> = {
  allowOnce: '允许本次',
  alwaysAllow: '始终允许',
  deny: '拒绝',
  running: '已授权，执行中...'
}

export function ApprovalCard({
  state,
  command,
  title,
  subtitle,
  reason,
  labels,
  onAllowOnce,
  onAlwaysAllow,
  onDeny,
  className,
  ...props
}: Omit<
  ComponentProps<'div'>,
  | 'children'
  | 'state'
  | 'command'
  | 'title'
  | 'subtitle'
  | 'onAllowOnce'
  | 'onAlwaysAllow'
  | 'onDeny'
> & {
  state: ApprovalState
  command: string
  title: string
  subtitle: string
  reason?: string
  labels?: ApprovalCardLabels
  onAllowOnce?: () => void
  onAlwaysAllow?: () => void
  onDeny?: () => void
}): React.ReactNode {
  return (
    <div
      data-slot="approval-card"
      className={cn(
        paper,
        'flex w-full max-w-md flex-col gap-3.5 rounded-[20px] p-4 shadow-sm',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-3">
        <span className="bg-foreground/[0.05] text-foreground/70 flex size-9 shrink-0 items-center justify-center rounded-xl">
          <ShieldAlertIcon className="size-4 text-amber-500" />
        </span>
        <div className="flex flex-col">
          <p className="text-[13.5px] font-medium">{title}</p>
          <p className="text-foreground/45 text-xs">{subtitle}</p>
        </div>
      </div>

      <div
        className={cn(
          field,
          'text-foreground/70 rounded-xl px-3.5 py-2.5 font-mono text-xs break-all'
        )}
      >
        {command}
      </div>

      {reason !== undefined && reason !== '' ? (
        <p className="text-foreground/55 text-xs leading-relaxed">{reason}</p>
      ) : null}

      <div className="flex h-8 items-center justify-end gap-2">
        {state === 'request' ? (
          <>
            <button
              type="button"
              onClick={onDeny}
              className="text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground/90 h-8 rounded-full px-3.5 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96] cursor-pointer"
            >
              {labels?.deny ?? DEFAULT_LABELS.deny}
            </button>
            {onAlwaysAllow && (
              <button
                type="button"
                onClick={onAlwaysAllow}
                className="text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground/90 h-8 rounded-full px-3.5 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96] cursor-pointer"
              >
                {labels?.alwaysAllow ?? DEFAULT_LABELS.alwaysAllow}
              </button>
            )}
            <button
              type="button"
              onClick={onAllowOnce}
              className={cn(
                inkButton,
                'flex h-8 items-center rounded-full px-3.5 text-xs font-medium cursor-pointer'
              )}
            >
              {labels?.allowOnce ?? DEFAULT_LABELS.allowOnce}
            </button>
          </>
        ) : (
          <div
            key={state}
            className="fade-in animate-in text-foreground/55 flex items-center gap-2 text-xs duration-300"
          >
            {state === 'running' ? (
              <>
                <Loader2Icon className="text-foreground/45 size-3.5 animate-spin" />
                {labels?.running ?? DEFAULT_LABELS.running}
              </>
            ) : state === 'denied' ? (
              <>
                <XIcon className="text-red-500 size-3.5" />
                已拒绝授权
              </>
            ) : (
              <>
                <CheckIcon className="size-3.5 text-emerald-500" />
                已授权通过
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
