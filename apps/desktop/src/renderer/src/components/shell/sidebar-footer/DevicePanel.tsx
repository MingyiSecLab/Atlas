import React from 'react'
import { Bot, Globe, Monitor, Settings, ShieldCheck, Wifi } from 'lucide-react'
import { FooterPopover } from './FooterPopover'

interface DevicePanelProps {
  onClose: () => void
  onOpenSettings?: () => void
}

export const DevicePanel: React.FC<DevicePanelProps> = ({ onClose, onOpenSettings }) => {
  const electronVersion = window.electron?.process?.versions?.electron

  const openSettings = (): void => {
    onClose()
    onOpenSettings?.()
  }

  return (
    <FooterPopover
      id="sidebar-device-panel"
      title="本机运行环境"
      label="本机运行环境"
      onClose={onClose}
    >
      <div className="sidebar-device-summary">
        <span className="sidebar-device-icon">
          <Monitor size={17} aria-hidden="true" />
          <span className="sidebar-status-dot" />
        </span>
        <div>
          <strong>Mingyi Desktop</strong>
          <span>{electronVersion ? `Electron ${electronVersion}` : '桌面运行环境'}</span>
        </div>
        <span className="sidebar-status-badge">在线</span>
      </div>

      <div className="sidebar-footer-separator" />

      <div className="sidebar-footer-row">
        <Wifi size={16} aria-hidden="true" />
        <span>本机连接</span>
        <span className="sidebar-footer-row-end sidebar-device-value">稳定</span>
      </div>
      <div className="sidebar-footer-row">
        <Globe size={16} aria-hidden="true" />
        <span>远程访问</span>
        <span className="sidebar-footer-row-end sidebar-device-value">未连接</span>
      </div>
      <div className="sidebar-footer-row">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>权限请求</span>
        <span className="sidebar-footer-row-end sidebar-count-badge">0</span>
      </div>
      <div className="sidebar-footer-row">
        <Bot size={16} aria-hidden="true" />
        <span>Agent 可用性</span>
        <span className="sidebar-footer-row-end sidebar-device-value">可用</span>
      </div>

      <div className="sidebar-footer-separator" />

      <button className="sidebar-device-settings" type="button" onClick={openSettings}>
        <Settings size={15} aria-hidden="true" />
        打开应用设置
      </button>
    </FooterPopover>
  )
}
