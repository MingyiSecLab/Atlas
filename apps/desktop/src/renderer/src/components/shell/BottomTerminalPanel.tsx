import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Maximize2Icon, Minimize2Icon, PlusIcon, SquareTerminalIcon, XIcon } from 'lucide-react'
import { LiveTerminal, LocalTerminalSession } from './terminal'
import { resolveTerminalFonts } from './terminal/fonts'
import type { TerminalColorScheme } from './terminal/prefs'
import {
  DEFAULT_SETTINGS,
  readSettings,
  SETTINGS_CHANGED_EVENT
} from '../overlays/settings/persistence'
import type { SettingsPreferences } from '../overlays/settings/types'

interface BottomTerminalPanelProps {
  isOpen: boolean
  onClose: () => void
}

interface TerminalTab {
  id: string
  index: number
  session: LocalTerminalSession
}

function createTab(index: number, preferences: SettingsPreferences): TerminalTab {
  const id = `terminal-${crypto.randomUUID()}`
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

function terminalColorScheme(theme: SettingsPreferences['terminalTheme']): TerminalColorScheme {
  if (theme === 'light') return 'GitHub Light Default'
  if (theme === 'dark') return 'GitHub Dark Default'
  return 'auto'
}

function TerminalContent({
  tab,
  active,
  suspended,
  preferences
}: {
  tab: TerminalTab
  active: boolean
  suspended: boolean
  preferences: SettingsPreferences
}): React.ReactNode {
  const status = useSyncExternalStore(
    (onChange) => tab.session.subscribeStatus(onChange),
    () => tab.session.getStatus()
  )
  const restartEpoch = useSyncExternalStore(
    (onChange) => tab.session.subscribeRestart(onChange),
    () => tab.session.getRestartEpoch()
  )

  return (
    <div
      data-testid={`terminal-content-${tab.id}`}
      aria-hidden={!active}
      className={`terminal-content ${active ? 'terminal-content-active' : ''}`}
    >
      <LiveTerminal
        key={`${tab.id}-${restartEpoch}`}
        session={tab.session}
        suspended={suspended || !active}
        className="terminal-live-frame"
        fontSize={preferences.terminalFontSize}
        colorScheme={terminalColorScheme(preferences.terminalTheme)}
      />
      {status.state === 'starting' && (
        <div className="terminal-status" role="status">
          正在启动终端...
        </div>
      )}
      {status.state === 'failed' && (
        <div className="terminal-status" role="alert">
          <span>终端启动失败：{status.error}</span>
          <button type="button" onClick={() => tab.session.restart()}>
            重试
          </button>
        </div>
      )}
      {status.state === 'exited' && (
        <div className="terminal-status" role="status">
          <span>{status.code === null ? '终端已结束' : `终端已退出（代码 ${status.code}）`}</span>
          <button type="button" onClick={() => tab.session.restart()}>
            重新启动
          </button>
        </div>
      )}
    </div>
  )
}

export function BottomTerminalPanel({
  isOpen,
  onClose
}: BottomTerminalPanelProps): React.ReactNode {
  const nextTabIndex = useRef(2)
  const [preferences, setPreferences] = useState<SettingsPreferences>(() => readSettings())
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [createTab(1, readSettings())])
  const [activeTabId, setActiveTabId] = useState(() => tabs[0]?.id ?? '')
  const [isMaximized, setIsMaximized] = useState(false)
  const [settledOpen, setSettledOpen] = useState(isOpen)
  const [settledMaximized, setSettledMaximized] = useState(isMaximized)
  const [terminalMounted, setTerminalMounted] = useState(isOpen)
  const tabsRef = useRef(tabs)
  const isAnimating = isOpen !== settledOpen || isMaximized !== settledMaximized

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
    // Decode bundled fonts before the first panel open so Restty can reach its themed first
    // frame during the panel transition instead of starting that work after the click.
    void resolveTerminalFonts()
  }, [])

  useEffect(() => {
    const mountTimer = isOpen
      ? window.setTimeout(() => {
          setTerminalMounted(true)
        }, 0)
      : undefined
    const settleTimer = window.setTimeout(() => {
      setSettledOpen(isOpen)
      setSettledMaximized(isMaximized)
    }, 280)
    return () => {
      if (mountTimer !== undefined) window.clearTimeout(mountTimer)
      window.clearTimeout(settleTimer)
    }
  }, [isOpen, isMaximized])

  useEffect(() => {
    if (isOpen && tabs.length === 0) {
      const replacement = createTab(nextTabIndex.current++, preferences)
      setTabs([replacement])
      setActiveTabId(replacement.id)
    }
  }, [isOpen, preferences, tabs.length])

  useEffect(() => {
    return () => tabsRef.current.forEach((tab) => tab.session.dispose())
  }, [])

  const addTab = (): void => {
    const tab = createTab(nextTabIndex.current++, preferences)
    setTabs((current) => [...current, tab])
    setActiveTabId(tab.id)
  }

  const closeTab = (id: string): void => {
    const index = tabs.findIndex((tab) => tab.id === id)
    if (index < 0) return
    tabs[index].session.dispose()
    const remaining = tabs.filter((tab) => tab.id !== id)
    setTabs(remaining)
    if (activeTabId === id) {
      setActiveTabId(remaining[Math.min(index, remaining.length - 1)]?.id ?? '')
    }
    if (remaining.length === 0) onClose()
  }

  return (
    <section
      data-testid="terminal-panel"
      data-open={isOpen ? '' : undefined}
      data-maximized={isMaximized ? '' : undefined}
      aria-label="终端面板"
      aria-hidden={!isOpen}
      className={`terminal-panel ${isOpen ? 'terminal-panel-open' : ''} ${
        isMaximized ? 'terminal-panel-maximized' : ''
      }`}
    >
      <header className="terminal-panel-header">
        <div className="terminal-tabs" role="tablist" aria-label="终端标签">
          {tabs.map((tab) => {
            const active = tab.id === activeTabId
            const label = `终端 ${tab.index}`
            return (
              <div className={`terminal-tab ${active ? 'terminal-tab-active' : ''}`} key={tab.id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`terminal-pane-${tab.id}`}
                  onClick={() => setActiveTabId(tab.id)}
                >
                  <SquareTerminalIcon aria-hidden size={14} />
                  <span>{label}</span>
                </button>
                <button
                  type="button"
                  className="terminal-tab-close"
                  aria-label={`关闭${label}`}
                  title={`关闭${label}`}
                  onClick={() => closeTab(tab.id)}
                >
                  <XIcon aria-hidden size={12} />
                </button>
              </div>
            )
          })}
          <button
            type="button"
            className="terminal-icon-button"
            onClick={addTab}
            title="新建终端标签"
            aria-label="新建终端标签"
          >
            <PlusIcon aria-hidden size={15} />
          </button>
        </div>
        <div className="terminal-panel-controls">
          <button
            type="button"
            className="terminal-icon-button"
            aria-pressed={isMaximized}
            onClick={() => setIsMaximized((value) => !value)}
            title={isMaximized ? '还原面板' : '最大化面板'}
            aria-label={isMaximized ? '还原面板' : '最大化面板'}
          >
            {isMaximized ? (
              <Minimize2Icon aria-hidden size={15} />
            ) : (
              <Maximize2Icon aria-hidden size={15} />
            )}
          </button>
          <button
            type="button"
            className="terminal-icon-button"
            onClick={onClose}
            title="关闭终端 (⌘J)"
            aria-label="关闭终端"
          >
            <XIcon aria-hidden size={15} />
          </button>
        </div>
      </header>

      <div className="terminal-content-stack">
        {terminalMounted &&
          tabs.map((tab) => (
            <div
              key={tab.id}
              id={`terminal-pane-${tab.id}`}
              role="tabpanel"
              className="terminal-pane"
            >
              <TerminalContent
                tab={tab}
                active={tab.id === activeTabId}
                suspended={!isOpen || isAnimating}
                preferences={preferences}
              />
            </div>
          ))}
      </div>
    </section>
  )
}
