import React, { useEffect, useRef, useState } from 'react'
import { Bell, Monitor } from 'lucide-react'
import { DevicePanel } from './DevicePanel'
import { NotificationsPanel } from './NotificationsPanel'
import type { FooterPanel, SidebarNotification } from './types'

interface SidebarFooterProps {
  isCollapsed?: boolean
  onOpenSettings?: () => void
}

const INITIAL_NOTIFICATIONS: SidebarNotification[] = [
  {
    id: 'environment-ready',
    title: '本机环境已就绪',
    detail: 'Mingyi Desktop 已连接，可以开始执行任务。',
    time: '刚刚',
    unread: true
  },
  {
    id: 'workspace-ready',
    title: '工作区已载入',
    detail: '项目文件和终端能力均可正常使用。',
    time: '2 分钟前',
    unread: true
  }
]

const READ_NOTIFICATIONS_KEY = 'mingyi_sidebar_read_notifications'
const VERSION_TITLE = `Mingyi ${__APP_VERSION__}${__BUILD_COMMIT__ ? ` (${__BUILD_COMMIT__})` : ''}`

const getInitialNotifications = (): SidebarNotification[] => {
  try {
    const readIds = new Set<string>(
      JSON.parse(localStorage.getItem(READ_NOTIFICATIONS_KEY) ?? '[]')
    )
    return INITIAL_NOTIFICATIONS.map((notification) => ({
      ...notification,
      unread: !readIds.has(notification.id)
    }))
  } catch {
    return INITIAL_NOTIFICATIONS
  }
}

export const SidebarFooter: React.FC<SidebarFooterProps> = ({ isCollapsed, onOpenSettings }) => {
  const [activePanel, setActivePanel] = useState<FooterPanel | null>(null)
  const [notifications, setNotifications] = useState<SidebarNotification[]>(getInitialNotifications)
  const footerRef = useRef<HTMLDivElement>(null)
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null)
  const unreadCount = notifications.filter((notification) => notification.unread).length
  const effectiveActivePanel = isCollapsed ? null : activePanel

  useEffect(() => {
    if (!activePanel) return

    const handlePointerDown = (event: PointerEvent): void => {
      if (!footerRef.current?.contains(event.target as Node)) setActivePanel(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [activePanel])

  useEffect(() => {
    try {
      localStorage.setItem(
        READ_NOTIFICATIONS_KEY,
        JSON.stringify(
          notifications
            .filter((notification) => !notification.unread)
            .map((notification) => notification.id)
        )
      )
    } catch {
      // Local persistence is optional in privacy-restricted renderer contexts.
    }
  }, [notifications])

  const closePanel = (): void => {
    setActivePanel(null)
    requestAnimationFrame(() => lastTriggerRef.current?.focus())
  }

  const togglePanel = (panel: FooterPanel, trigger: HTMLButtonElement): void => {
    lastTriggerRef.current = trigger
    setActivePanel((current) => (current === panel ? null : panel))
  }

  return (
    <div ref={footerRef} className="sidebar-footer app-no-drag" data-testid="sidebar-footer">
      <div className="sidebar-footer-controls">
        <div className="sidebar-footer-actions">
          <button
            className={`sidebar-footer-button${effectiveActivePanel === 'device' ? ' is-active' : ''}`}
            type="button"
            aria-label="打开本机运行环境"
            aria-expanded={effectiveActivePanel === 'device'}
            aria-controls="sidebar-device-panel"
            title="本机运行环境"
            onClick={(event) => togglePanel('device', event.currentTarget)}
          >
            <Monitor size={16} aria-hidden="true" />
            <span className="sidebar-device-online" aria-hidden="true" />
          </button>
          <button
            className={`sidebar-footer-button${effectiveActivePanel === 'notifications' ? ' is-active' : ''}`}
            type="button"
            aria-label={`打开通知中心${unreadCount > 0 ? `，${unreadCount} 条未读` : ''}`}
            aria-expanded={effectiveActivePanel === 'notifications'}
            aria-controls="sidebar-notifications-panel"
            title="通知"
            onClick={(event) => togglePanel('notifications', event.currentTarget)}
          >
            <Bell size={16} aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="sidebar-notification-count" aria-hidden="true">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
        <span className="sidebar-footer-version" title={VERSION_TITLE}>
          {__APP_VERSION__}
        </span>
      </div>

      {effectiveActivePanel === 'notifications' && (
        <NotificationsPanel
          notifications={notifications}
          onClose={closePanel}
          onRead={(id) =>
            setNotifications((current) =>
              current.map((notification) =>
                notification.id === id ? { ...notification, unread: false } : notification
              )
            )
          }
          onReadAll={() =>
            setNotifications((current) =>
              current.map((notification) => ({ ...notification, unread: false }))
            )
          }
        />
      )}
      {effectiveActivePanel === 'device' && (
        <DevicePanel onClose={closePanel} onOpenSettings={onOpenSettings} />
      )}
    </div>
  )
}
