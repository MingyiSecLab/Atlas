'use client'

import type { ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'
import { formatRelativeDay, type TimeInput } from '@renderer/lib/date'
import { mono } from './surfaces'

export interface DatedMessage {
  id: string
  day: string
  time: string
  role: 'user' | 'assistant'
  text: string
}

/**
 * 单独一行日期分隔（细线 + 眉题 + 细线）。
 *
 * 抽出来是因为本应用的消息由逐条 primitives 渲染，
 * 用不了整段转录那套带气泡的 `DaySeparator`；真正需要复用的只有这一行的视觉。
 */
export function DaySeparatorRow({
  label,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & { label: string }): React.ReactNode {
  return (
    <div
      data-slot="day-separator-row"
      className={cn('flex items-center gap-2.5 py-1.5 w-full my-2 select-none', className)}
      {...props}
    >
      <span className="bg-foreground/[0.08] h-px flex-1" />
      <span className={cn(mono, 'text-[11px] text-foreground/35 px-1 font-medium tracking-wide')}>
        {label}
      </span>
      <span className="bg-foreground/[0.08] h-px flex-1" />
    </div>
  )
}

/**
 * 跨天分隔条：包装 DaySeparatorRow，自动计算传入 timestamp 的相对日期文案
 */
export function DayDivider({
  timestamp,
  className
}: {
  timestamp: TimeInput
  className?: string
}): React.ReactNode {
  return <DaySeparatorRow label={formatRelativeDay(timestamp)} className={className} />
}

/**
 * assistant-ui 官方 DaySeparator 组件（带 hover 出现时间戳）。
 */
export function DaySeparator({
  messages,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'children' | 'messages'> & {
  messages: readonly DatedMessage[]
}): React.ReactNode {
  return (
    <div
      data-slot="day-separator"
      className={cn('flex w-full max-w-sm flex-col gap-2', className)}
      {...props}
    >
      {messages.map((message, index) => {
        const prev = messages[index - 1]
        const newDay = !prev || message.day !== prev.day

        return (
          <div key={message.id} className="flex flex-col gap-2">
            {newDay && <DaySeparatorRow label={message.day} />}
            <div
              className={cn(
                'group flex items-baseline gap-2',
                message.role === 'user' && 'flex-row-reverse'
              )}
            >
              <span
                className={cn(
                  'max-w-[80%] text-[13.5px] leading-relaxed break-words',
                  message.role === 'user'
                    ? 'bg-foreground/[0.05] rounded-2xl px-3.5 py-2'
                    : 'text-foreground/75'
                )}
              >
                {message.text}
              </span>
              <span
                className={cn(
                  mono,
                  'text-foreground/0 group-hover:text-foreground/30 shrink-0 tabular-nums transition-colors text-xs'
                )}
              >
                {message.time}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
