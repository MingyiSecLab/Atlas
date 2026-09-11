export type FooterPanel = 'notifications' | 'device'

export interface SidebarNotification {
  id: string
  title: string
  detail: string
  time: string
  unread: boolean
}
