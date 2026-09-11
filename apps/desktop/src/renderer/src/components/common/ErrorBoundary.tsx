import React, { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallbackTitle?: string
  fallbackMessage?: string
  onReset?: () => void
  showHomeButton?: boolean
  onGoHome?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            padding: '32px 24px',
            backgroundColor: '#fafafc',
            color: '#1c1c1e',
            userSelect: 'none',
            boxSizing: 'border-box',
            textAlign: 'center'
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#fee2e2',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px'
            }}
          >
            <AlertTriangle size={24} />
          </div>

          <h3
            style={{
              fontSize: '16px',
              fontWeight: 600,
              margin: '0 0 8px 0',
              color: '#18181b'
            }}
          >
            {this.props.fallbackTitle ?? '页面渲染遇到异常'}
          </h3>

          <p
            style={{
              fontSize: '13px',
              color: '#71717a',
              maxWidth: '420px',
              margin: '0 0 20px 0',
              lineHeight: 1.5
            }}
          >
            {this.props.fallbackMessage ??
              '对话历史记录或组件渲染时遇到了非预期格式数据，已为您拦截保护，避免白屏。'}
          </p>

          {this.state.error?.message ? (
            <div
              style={{
                fontSize: '11px',
                color: '#991b1b',
                backgroundColor: '#fef2f2',
                padding: '8px 12px',
                borderRadius: '6px',
                marginBottom: '20px',
                maxWidth: '480px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'monospace'
              }}
              title={this.state.error.message}
            >
              {this.state.error.message}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid #d4d4d8',
                backgroundColor: '#ffffff',
                color: '#18181b',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            >
              <RefreshCw size={14} />
              <span>重新加载</span>
            </button>

            {this.props.showHomeButton && this.props.onGoHome ? (
              <button
                type="button"
                onClick={this.props.onGoHome}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#18181b',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                <Home size={14} />
                <span>返回主页</span>
              </button>
            ) : null}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
