import React, { useState, useRef } from 'react'
import type { BrowserTab } from './types'
import { BrowserTabStrip } from './BrowserTabStrip'
import { BrowserPane } from './BrowserPane'

const DEFAULT_URL = 'http://localhost:5174'

function createNewTab(
  index: number,
  url: string | null = null,
  title: string | null = null
): BrowserTab {
  return {
    id: `browser-tab-${crypto.randomUUID()}`,
    title: title || (url ? url.replace(/^https?:\/\//, '') : `标签页 ${index}`),
    url
  }
}

export const BrowserView: React.FC = () => {
  const nextTabIndex = useRef(2)
  const [tabs, setTabs] = useState<BrowserTab[]>(() => [
    createNewTab(1, DEFAULT_URL, 'Mingyi Preview')
  ])
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0]?.id ?? '')

  const handleAddTab = (): void => {
    const tab = createNewTab(nextTabIndex.current++)
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
  }

  const handleCloseTab = (id: string): void => {
    const index = tabs.findIndex((t) => t.id === id)
    if (index < 0) return
    const nextTabs = tabs.filter((t) => t.id !== id)
    if (nextTabs.length === 0) {
      const fallback = createNewTab(nextTabIndex.current++)
      setTabs([fallback])
      setActiveTabId(fallback.id)
    } else {
      setTabs(nextTabs)
      if (activeTabId === id) {
        const nextActive = nextTabs[Math.min(index, nextTabs.length - 1)]
        setActiveTabId(nextActive.id)
      }
    }
  }

  const handleNavigate = (tabId: string, url: string): void => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab
        return {
          ...tab,
          url,
          title: tab.title || url.replace(/^https?:\/\//, '')
        }
      })
    )
  }

  const handleTitleChange = (tabId: string, title: string): void => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab
        return { ...tab, title }
      })
    )
  }

  return (
    <div className="right-panel-view right-panel-browser-view" data-testid="right-panel-browser">
      {/* Sub-tab strip */}
      <BrowserTabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={handleCloseTab}
        onAddTab={handleAddTab}
      />

      {/* Resident tabs container */}
      <div className="browser-panes-stack">
        {tabs.map((tab) => (
          <BrowserPane
            key={tab.id}
            tabId={tab.id}
            url={tab.url}
            isActive={tab.id === activeTabId}
            onNavigate={(url) => handleNavigate(tab.id, url)}
            onTitleChange={(title) => handleTitleChange(tab.id, title)}
          />
        ))}
      </div>
    </div>
  )
}
