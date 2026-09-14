import React from 'react'
import { RotateCcw, Square, X } from 'lucide-react'

export interface StoppedRunCardProps {
  onRetry?: () => void
  onDismiss?: () => void
  message?: string
}

export const StoppedRunCard: React.FC<StoppedRunCardProps> = ({
  onRetry,
  onDismiss,
  message = '任务已由用户手动停止'
}) => {
  return (
    <div className="aui-stopped-run-container" role="status" aria-label="执行已被用户中止">
      <div className="aui-stopped-run-card">
        <div className="aui-stopped-run-left">
          <span className="aui-stopped-run-icon-slot" aria-hidden="true">
            <Square size={11} fill="currentColor" />
          </span>
          <span className="aui-stopped-run-text">{message}</span>
        </div>

        <div className="aui-stopped-run-actions">
          {onRetry && (
            <button
              type="button"
              className="aui-stopped-run-btn is-retry"
              onClick={onRetry}
              title="重新尝试执行该轮任务"
            >
              <RotateCcw size={12} />
              <span>重新尝试</span>
            </button>
          )}

          {onDismiss && (
            <button
              type="button"
              className="aui-stopped-run-btn is-dismiss"
              onClick={onDismiss}
              title="忽略该提示"
              aria-label="关闭"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
