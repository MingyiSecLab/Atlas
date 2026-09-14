import React from 'react'
import { Loader2, X } from 'lucide-react'

export interface RetryConnectingBarProps {
  attempt: number
  maxRetries: number
  message?: string
  elapsedSeconds?: number
  onCancel?: () => void
}

function formatWorkDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes} 分 ${seconds > 0 ? `${seconds} 秒` : ''}`.trim()
}

export const RetryConnectingBar: React.FC<RetryConnectingBarProps> = ({
  attempt,
  maxRetries,
  message,
  elapsedSeconds,
  onCancel
}) => {
  return (
    <div className="retry-connecting-container" role="status" aria-live="polite">
      {typeof elapsedSeconds === 'number' && elapsedSeconds > 0 && (
        <div className="retry-working-time">工作中 {formatWorkDuration(elapsedSeconds)}</div>
      )}
      <div
        className="retry-connecting-card"
        title={message || '网络连接中断，正在自动尝试重新连接'}
      >
        <div className="retry-connecting-left">
          <Loader2 size={15} className="retry-connecting-spinner" aria-hidden="true" />
          <span className="retry-connecting-text">
            重新连接中... {attempt}/{maxRetries}
          </span>
        </div>
        {onCancel && (
          <button
            type="button"
            className="retry-connecting-cancel-btn"
            onClick={onCancel}
            title="取消重连并停止任务"
          >
            <X size={13} aria-hidden="true" />
            <span>取消</span>
          </button>
        )}
      </div>
    </div>
  )
}
