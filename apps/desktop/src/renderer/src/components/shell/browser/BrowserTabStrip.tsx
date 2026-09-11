import React from 'react'
import { Compass, Plus, X } from 'lucide-react'
import type { BrowserTab } from './types'

interface BrowserTabStripProps {
  tabs: BrowserTab[]
  activeTabId: string
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onAddTab: () => void
}

export const BrowserTabStrip: React.FC<BrowserTabStripProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab
}) => {
  return (
    <div className="browser-tab-strip" role="tablist" aria-label="浏览器标签栏">
      <div className="browser-tab-list">
        {tabs.map((tab, index) => {
          const active = tab.id === activeTabId
          const label = tab.title && tab.title.trim().length > 0 ? tab.title : `标签页 ${index + 1}`
          const tooltip = tab.url ? `${label} (${tab.url})` : label

          return (
            <div
              key={tab.id}
              className={`browser-tab-item ${active ? 'is-active' : ''}`}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  onCloseTab(tab.id)
                }
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                title={tooltip}
                className="browser-tab-main-btn"
                onClick={() => onSelectTab(tab.id)}
              >
                <Compass className="browser-tab-icon" size={13} />
                <span className="browser-tab-title">{label}</span>
              </button>
              <button
                type="button"
                aria-label={`关闭 ${label}`}
                title="关闭标签"
                className="browser-tab-close-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(tab.id)
                }}
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        className="browser-add-tab-btn"
        onClick={onAddTab}
        aria-label="新建浏览器标签"
        title="新建标签页"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
