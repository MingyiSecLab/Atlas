import React, { useState, useEffect } from 'react'
import { X, ShieldCheck, Check, Settings, Globe, Bell } from 'lucide-react'
import type { BuiltinConnector } from './hub-types'

interface ConnectorConfigModalProps {
  connector: BuiltinConnector | null
  isOpen: boolean
  onClose: () => void
  onSave?: (connector: BuiltinConnector) => void
}

interface InnerProps {
  connector: BuiltinConnector
  onClose: () => void
  onSave?: (connector: BuiltinConnector) => void
}

function loadInitialConfig(id: string): {
  targetHost: string
  interval: string
  alertLevel: string
} {
  try {
    const saved = localStorage.getItem(`connector_config_${id}`)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        targetHost: parsed.targetHost || '',
        interval: parsed.interval || '24h',
        alertLevel: parsed.alertLevel || 'high'
      }
    }
  } catch {
    // ignore
  }
  return { targetHost: '', interval: '24h', alertLevel: 'high' }
}

const ConnectorConfigInnerForm: React.FC<InnerProps> = ({ connector, onClose, onSave }) => {
  const [initial] = useState(() => loadInitialConfig(connector.id))
  const [targetHost, setTargetHost] = useState(() => initial.targetHost)
  const [interval, setInterval] = useState(() => initial.interval)
  const [alertLevel, setAlertLevel] = useState(() => initial.alertLevel)
  const [savedSuccess, setSavedSuccess] = useState(false)

  const handleSave = (): void => {
    try {
      localStorage.setItem(
        `connector_config_${connector.id}`,
        JSON.stringify({ targetHost, interval, alertLevel })
      )
    } catch {
      // ignore
    }
    setSavedSuccess(true)
    setTimeout(() => {
      setSavedSuccess(false)
      onSave?.(connector)
      onClose()
    }, 400)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="hub-modal-overlay" onClick={onClose}>
      <div
        className="hub-modal-container"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        {/* Header */}
        <div className="hub-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={18} color="#71717a" />
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary, #18181b)' }}>
              连接器配置
            </span>
          </div>
          <button
            type="button"
            className="hub-modal-close"
            onClick={onClose}
            aria-label="关闭配置"
            title="关闭 (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div
          className="hub-modal-body"
          style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {/* Identity Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderRadius: 10,
              background: '#f8fafc',
              border: '1px solid #e2e8f0'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#059669',
                  overflow: 'hidden'
                }}
              >
                {connector.logo ? (
                  <img
                    src={connector.logo}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <ShieldCheck size={18} color="#059669" />
                )}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>
                  {connector.name}
                </div>
                <div style={{ fontSize: 11.5, color: '#71717a' }}>{connector.identifier}</div>
              </div>
            </div>

            <span
              style={{
                fontSize: 11.5,
                fontWeight: 500,
                color: '#059669',
                background: '#ecfdf5',
                padding: '2px 8px',
                borderRadius: 999
              }}
            >
              已就绪（5 个工具）
            </span>
          </div>

          {/* Description */}
          <div style={{ fontSize: 12.5, color: '#52525b', lineHeight: 1.5 }}>
            {connector.description}
          </div>

          {/* Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="hub-field-group">
              <label
                className="hub-field-label"
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <Globe size={13} color="#71717a" />
                <span>默认监测目标站点（域名或 URL）</span>
              </label>
              <input
                type="text"
                className="hub-field-input"
                placeholder="例如：https://my-company-domain.com"
                value={targetHost}
                onChange={(e) => setTargetHost(e.target.value)}
              />
            </div>

            <div className="hub-field-group">
              <label
                className="hub-field-label"
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <Bell size={13} color="#71717a" />
                <span>自动化巡检周期</span>
              </label>
              <select
                className="hub-field-input"
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
              >
                <option value="1h">每 1 小时巡检</option>
                <option value="6h">每 6 小时巡检</option>
                <option value="12h">每 12 小时巡检</option>
                <option value="24h">每天巡检一次（默认）</option>
                <option value="manual">仅手动触发检测</option>
              </select>
            </div>

            <div className="hub-field-group">
              <label className="hub-field-label">告警通知策略</label>
              <select
                className="hub-field-input"
                value={alertLevel}
                onChange={(e) => setAlertLevel(e.target.value)}
              >
                <option value="high">仅高风险漏洞与证书即将过期时通知（推荐）</option>
                <option value="all">发现任何安全配置缺陷即通知</option>
                <option value="none">静默记录，不弹窗打扰</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="hub-modal-footer">
          <button type="button" className="hub-modal-btn-cancel" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="hub-modal-btn-save"
            onClick={handleSave}
            disabled={savedSuccess}
          >
            {savedSuccess ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Check size={14} /> 已保存
              </span>
            ) : (
              '保存配置'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export const ConnectorConfigModal: React.FC<ConnectorConfigModalProps> = ({
  connector,
  isOpen,
  onClose,
  onSave
}) => {
  if (!isOpen || !connector) return null

  return (
    <ConnectorConfigInnerForm
      key={connector.id}
      connector={connector}
      onClose={onClose}
      onSave={onSave}
    />
  )
}
