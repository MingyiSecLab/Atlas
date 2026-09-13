import { Ban, CheckCircle2, LoaderCircle, ShieldAlert, XCircle } from 'lucide-react'
import type { ToolStatus } from '../types'

interface ToolStatusBadgeProps {
  status: ToolStatus
}

export function ToolStatusBadge({ status }: ToolStatusBadgeProps): React.ReactNode {
  switch (status) {
    case 'running':
      return (
        <span className="aui-tool-badge is-running" title="正在执行工具">
          <span className="aui-tool-badge-dot">
            <span className="aui-tool-badge-pulse" />
          </span>
          <LoaderCircle size={12} className="aui-tool-spinner" />
          <span>执行中</span>
        </span>
      )
    case 'pending':
      return (
        <span className="aui-tool-badge is-pending" title="等待执行">
          <span className="aui-tool-badge-dot" />
          <span>待执行</span>
        </span>
      )
    case 'waiting_approval':
      return (
        <span className="aui-tool-badge is-approval" title="需要用户授权">
          <ShieldAlert size={12} />
          <span>待授权</span>
        </span>
      )
    case 'denied':
      return (
        <span className="aui-tool-badge is-denied" title="用户已拒绝授权">
          <Ban size={12} />
          <span>已拒绝</span>
        </span>
      )
    case 'error':
      return (
        <span className="aui-tool-badge is-error" title="执行出错">
          <XCircle size={12} />
          <span>失败</span>
        </span>
      )
    case 'success':
    default:
      return (
        <span className="aui-tool-badge is-success" title="执行成功">
          <CheckCircle2 size={12} />
          <span>已完成</span>
        </span>
      )
  }
}
