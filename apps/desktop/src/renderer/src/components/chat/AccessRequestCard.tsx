import type { RuntimeAccessRequest } from '@mingyi/runtime'
import { FolderLock, LoaderCircle, ShieldQuestion } from 'lucide-react'
import { useState } from 'react'
import { field, mono, paper } from '@renderer/components/assistant-ui/elements/surfaces'
import { cn } from '@renderer/lib/utils'

export function AccessRequestCard({
  request,
  pendingCount = 1,
  onRespond
}: {
  request: RuntimeAccessRequest
  pendingCount?: number
  onRespond: (approved: boolean) => Promise<void>
}): React.ReactNode {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function respond(approved: boolean): Promise<void> {
    if (isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    try {
      await onRespond(approved)
    } catch (responseError) {
      setError(responseError instanceof Error ? responseError.message : String(responseError))
      setIsSubmitting(false)
    }
  }

  return (
    <section
      role="group"
      aria-label={`目录访问请求：${request.path}`}
      id={`access-request-${request.toolCallId}`}
      className={cn(
        paper,
        'chat-approval',
        'flex w-full flex-col gap-3 rounded-2xl p-4 shadow-sm border border-border/70 my-2 animate-in fade-in slide-in-from-bottom-2 duration-200'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <ShieldQuestion size={16} />
          </span>
          <div className="flex flex-col">
            <strong className="text-sm font-semibold text-foreground">允许访问外部目录？</strong>
            <span className="text-[11.5px] text-muted-foreground">
              助理已暂停，等待你的决定
              {pendingCount > 1 ? ` · 还有 ${pendingCount - 1} 个待审请求` : ''}
            </span>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-medium text-amber-600 dark:text-amber-400">
          安全边界
        </span>
      </div>

      {request.reason ? (
        <p className="text-xs text-foreground/80 leading-relaxed">{request.reason}</p>
      ) : (
        <p className="text-xs text-muted-foreground leading-relaxed">
          助理需要访问当前工作区之外的文件目录，执行可能涉及读取或修改外部数据。
        </p>
      )}

      <div
        className={cn(
          field,
          'flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-mono text-foreground/90 overflow-x-auto'
        )}
      >
        <FolderLock size={14} className="shrink-0 text-muted-foreground/60" aria-hidden="true" />
        <span className={cn(mono, 'truncate select-all')}>{request.path || '未提供有效路径'}</span>
      </div>

      {error ? (
        <div
          className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive leading-relaxed"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => void respond(false)}
          className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 cursor-pointer"
        >
          拒绝授权
        </button>
        <button
          type="button"
          autoFocus
          disabled={isSubmitting}
          onClick={() => void respond(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-medium text-primary-foreground shadow-xs transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {isSubmitting ? <LoaderCircle className="animate-spin" size={13} /> : null}
          <span>允许访问</span>
        </button>
      </div>
    </section>
  )
}
