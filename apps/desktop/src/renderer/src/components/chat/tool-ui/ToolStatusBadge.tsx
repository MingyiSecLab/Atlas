import { Ban, CheckCircle2, Clock, Loader2, ShieldAlert, XCircle } from 'lucide-react'
import type { ToolStatus } from '../types'

interface ToolStatusBadgeProps {
  status: ToolStatus
}

/** Codex 风格 icon-only 状态指示（文字进 title/aria-label） */
export function ToolStatusBadge({ status }: ToolStatusBadgeProps): React.ReactNode {
  switch (status) {
    case 'running':
      return (
        <span className="aui-tool-badge is-running" role="status" title="执行中" aria-label="执行中">
          <Loader2 size={13} className="aui-tool-spinner" />
        </span>
      )
    case 'pending':
      return (
        <span className="aui-tool-badge is-pending" role="status" title="待执行" aria-label="待执行">
          <Clock size={13} />
        </span>
      )
    case 'waiting_approval':
      return (
        <span
          className="aui-tool-badge is-approval"
          role="status"
          title="待授权"
          aria-label="待授权"
        >
          <ShieldAlert size={13} />
        </span>
      )
    case 'denied':
      return (
        <span className="aui-tool-badge is-denied" role="status" title="已拒绝" aria-label="已拒绝">
          <Ban size={13} />
        </span>
      )
    case 'error':
      return (
        <span className="aui-tool-badge is-error" role="status" title="失败" aria-label="失败">
          <XCircle size={13} />
        </span>
      )
    case 'success':
    default:
      return (
        <span className="aui-tool-badge is-success" role="status" title="已完成" aria-label="已完成">
          <CheckCircle2 size={13} />
        </span>
      )
  }
}
