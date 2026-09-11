import React from 'react'
import { PlusIcon, SquareTerminalIcon, XIcon } from 'lucide-react'

export interface TerminalTabItem {
  id: string
  index: number
}

interface SectionTerminalTabStripProps {
  tabs: TerminalTabItem[]
  activeTabId: string
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onAddTab: () => void
  className?: string
}

export function SectionTerminalTabStrip({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
  className = ''
}: SectionTerminalTabStripProps): React.ReactNode {
  return (
    <div
      className={`right-panel-terminal-tabs ${className}`}
      role="tablist"
      aria-label="终端标签列表"
    >
      <div className="terminal-tab-list">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          const label = `Terminal ${tab.index}`

          return (
            <div
              key={tab.id}
              className={`terminal-tab-button ${active ? 'is-active' : ''}`}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault()
                  onCloseTab(tab.id)
                }
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`right-terminal-pane-${tab.id}`}
                className="terminal-tab-trigger"
                onClick={() => onSelectTab(tab.id)}
                title={label}
              >
                <SquareTerminalIcon size={13} aria-hidden />
                <span className="terminal-tab-label">{label}</span>
              </button>

              <button
                type="button"
                className="terminal-tab-close-btn"
                aria-label={`关闭 ${label}`}
                title={`关闭 ${label}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onCloseTab(tab.id)
                }}
              >
                <XIcon size={12} aria-hidden />
              </button>
            </div>
          )
        })}
      </div>

      <div className="terminal-tab-actions">
        <button
          type="button"
          className="terminal-new-tab-btn"
          aria-label="新建终端标签"
          title="新建终端"
          onClick={onAddTab}
        >
          <PlusIcon size={14} aria-hidden />
        </button>
      </div>
    </div>
  )
}
