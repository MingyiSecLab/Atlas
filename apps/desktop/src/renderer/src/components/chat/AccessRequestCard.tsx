import type { RuntimeAccessRequest } from '@mingyi/runtime'
import { FolderLock, LoaderCircle, ShieldQuestion } from 'lucide-react'
import { useState } from 'react'

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
      className="chat-approval"
      role="group"
      aria-label={`目录访问请求：${request.path}`}
      id={`access-request-${request.toolCallId}`}
    >
      <div className="chat-approval-heading">
        <span className="chat-approval-icon">
          <ShieldQuestion size={16} />
        </span>
        <div>
          <strong>允许访问外部目录？</strong>
          <span>
            助理已暂停，等待你的决定
            {pendingCount > 1 ? ` · 还有 ${pendingCount - 1} 个请求` : ''}
          </span>
        </div>
        <span className="chat-approval-risk is-medium">外部目录</span>
      </div>
      <p>{request.reason || '助理需要访问当前工作区之外的目录。'}</p>
      <details className="chat-approval-details" open>
        <summary>请求的目录</summary>
        <pre>
          <FolderLock size={13} aria-hidden="true" /> {request.path || '未提供路径'}
        </pre>
      </details>
      {error ? (
        <div className="chat-approval-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="chat-approval-actions">
        <button type="button" disabled={isSubmitting} onClick={() => void respond(false)}>
          拒绝
        </button>
        <button
          className="is-primary"
          type="button"
          autoFocus
          disabled={isSubmitting}
          onClick={() => void respond(true)}
        >
          {isSubmitting ? <LoaderCircle className="is-spinning" size={13} /> : null}
          允许访问
        </button>
      </div>
    </section>
  )
}
