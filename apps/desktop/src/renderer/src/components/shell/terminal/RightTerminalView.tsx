import React, { useEffect, useRef, useState } from 'react'
import { LocalTerminalSession } from './session'
import { resolveTerminalFonts } from './fonts'
import { SectionTerminalTabStrip } from './SectionTerminalTabStrip'
import { RightTerminalPane } from './RightTerminalPane'
import {
  DEFAULT_SETTINGS,
  readSettings,
  SETTINGS_CHANGED_EVENT
} from '../../overlays/settings/persistence'
import type { SettingsPreferences } from '../../overlays/settings/types'

export interface TerminalTabRecord {
  id: string
  index: number
  session: LocalTerminalSession
}

function createTerminalTab(index: number, preferences: SettingsPreferences): TerminalTabRecord {
  const id = `right-terminal-${crypto.randomUUID()}`
  return {
    id,
    index,
    session: new LocalTerminalSession({
      id,
      cols: 80,
      rows: 24,
      shell: preferences.terminalShell === 'system' ? undefined : preferences.terminalShell
    })
  }
}

export function RightTerminalView(): React.ReactNode {
  const nextTabIndex = useRef(2)
  const [preferences, setPreferences] = useState<SettingsPreferences>(() => readSettings())
  const [tabs, setTabs] = useState<TerminalTabRecord[]>(() => [
    createTerminalTab(1, readSettings())
  ])
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0]?.id ?? '')
  const tabsRef = useRef(tabs)

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  useEffect(() => {
    const handleSettingsChange = (event: Event): void => {
      const next = (event as CustomEvent<SettingsPreferences>).detail
      setPreferences(next ?? DEFAULT_SETTINGS)
    }
    window.addEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChange)
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChange)
  }, [])

  useEffect(() => {
    void resolveTerminalFonts()
  }, [])

  useEffect(() => {
    return () => {
      tabsRef.current.forEach((tab) => tab.session.dispose())
    }
  }, [])

  const handleAddTab = (): void => {
    const newTab = createTerminalTab(nextTabIndex.current++, preferences)
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(newTab.id)
  }

  const handleCloseTab = (id: string): void => {
    const tabIndex = tabs.findIndex((t) => t.id === id)
    if (tabIndex < 0) return

    tabs[tabIndex].session.dispose()
    const remaining = tabs.filter((t) => t.id !== id)

    if (remaining.length === 0) {
      // Recreate an initial tab if all tabs are closed
      const freshTab = createTerminalTab(nextTabIndex.current++, preferences)
      setTabs([freshTab])
      setActiveTabId(freshTab.id)
      return
    }

    setTabs(remaining)
    if (activeTabId === id) {
      const nextActive = remaining[Math.min(tabIndex, remaining.length - 1)]
      setActiveTabId(nextActive?.id ?? '')
    }
  }

  return (
    <div className="right-panel-view right-panel-terminal-view" data-testid="right-panel-terminal">
      <SectionTerminalTabStrip
        tabs={tabs.map((t) => ({ id: t.id, index: t.index }))}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={handleCloseTab}
        onAddTab={handleAddTab}
      />

      <div className="right-terminal-stack">
        {tabs.map((tab) => (
          <RightTerminalPane
            key={tab.id}
            id={tab.id}
            session={tab.session}
            active={tab.id === activeTabId}
            suspended={tab.id !== activeTabId}
            preferences={preferences}
          />
        ))}
      </div>
    </div>
  )
}
