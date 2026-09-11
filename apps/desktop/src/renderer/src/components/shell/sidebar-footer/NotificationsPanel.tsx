import React from 'react'
import { Bell, Check, CircleCheck, Info } from 'lucide-react'
import { FooterPopover } from './FooterPopover'
import type { SidebarNotification } from './types'

interface NotificationsPanelProps {
  notifications: SidebarNotification[]
  onClose: () => void
  onRead: (id: string) => void
  onReadAll: () => void
}

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  notifications,
  onClose,
  onRead,
  onReadAll
}) => {
  const unreadCount = notifications.filter((notification) => notification.unread).length

  return (
    <FooterPopover id="sidebar-notifications-panel" title="通知" label="通知中心" onClose={onClose}>
      <div className="sidebar-notifications-toolbar">
        <span>{unreadCount > 0 ? `${unreadCount} 条未读` : '已全部读完'}</span>
        <button type="button" onClick={onReadAll} disabled={unreadCount === 0}>
          <Check size={13} aria-hidden="true" />
          全部已读
        </button>
      </div>

      <div className="sidebar-notification-list" aria-live="polite">
        {notifications.length === 0 ? (
          <div className="sidebar-notifications-empty">
            <Bell size={18} aria-hidden="true" />
            <span>暂无通知</span>
          </div>
        ) : (
          notifications.map((notification, index) => {
            const Icon = index === 0 ? CircleCheck : Info
            return (
              <button
                key={notification.id}
                className={`sidebar-notification-item${notification.unread ? ' is-unread' : ''}`}
                type="button"
                onClick={() => onRead(notification.id)}
              >
                <span className="sidebar-notification-icon">
                  <Icon size={15} aria-hidden="true" />
                </span>
                <span className="sidebar-notification-content">
                  <span className="sidebar-notification-heading">
                    <strong>{notification.title}</strong>
                    <time>{notification.time}</time>
                  </span>
                  <span>{notification.detail}</span>
                </span>
                {notification.unread && <span className="sidebar-unread-dot" aria-label="未读" />}
              </button>
            )
          })
        )}
      </div>
    </FooterPopover>
  )
}
