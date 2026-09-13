import React from 'react'
import { Bell, Brain, Heart, KeyRound, Plug, Settings, TerminalSquare } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SettingsPage } from '../types'

interface SettingsNavProps {
  activePage: SettingsPage
  onSelect: (page: SettingsPage) => void
}

interface NavItem {
  id: SettingsPage
  label: string
  icon: LucideIcon
}

const SETTINGS_NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: '个人',
    items: [
      { id: 'general', label: '基础', icon: Settings },
      { id: 'memory', label: '记忆', icon: Brain },
      { id: 'terminal', label: '终端', icon: TerminalSquare },
      { id: 'notifications', label: '通知', icon: Bell }
    ]
  },
  {
    label: '集成',
    items: [
      { id: 'providers', label: '模型服务', icon: KeyRound },
      { id: 'connectors', label: '连接器', icon: Plug }
    ]
  },
  {
    label: '关于',
    items: [{ id: 'acknowledgements', label: '致谢', icon: Heart }]
  }
]

export const SettingsNav: React.FC<SettingsNavProps> = ({ activePage, onSelect }) => (
  <aside className="settings-nav">
    <div className="settings-nav-title">设置</div>
    <nav aria-label="设置分类">
      {SETTINGS_NAV_GROUPS.map((group) => (
        <div className="settings-nav-group" key={group.label}>
          <div className="settings-nav-label">{group.label}</div>
          {group.items.map((item) => {
            const Icon = item.icon
            const active = activePage === item.id
            return (
              <button
                className={`settings-nav-item${active ? ' is-active' : ''}`}
                key={item.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onSelect(item.id)}
              >
                <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      ))}
    </nav>
    <div className="settings-nav-version">Mingyi v1.0.0</div>
  </aside>
)
