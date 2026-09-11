import React, { useSyncExternalStore } from 'react'
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon, RefreshCwIcon } from 'lucide-react'
import { LiveTerminal } from './live-terminal'
import type { LocalTerminalSession } from './session'
import type { TerminalColorScheme } from './prefs'
import type { SettingsPreferences } from '../../overlays/settings/types'

interface RightTerminalPaneProps {
  id: string
  session: LocalTerminalSession
  active: boolean
  suspended: boolean
  preferences: SettingsPreferences
}

function terminalColorScheme(theme: SettingsPreferences['terminalTheme']): TerminalColorScheme {
  if (theme === 'light') return 'GitHub Light Default'
  if (theme === 'dark') return 'GitHub Dark Default'
  return 'auto'
}

export function RightTerminalPane({
  id,
  session,
  active,
  suspended,
  preferences
}: RightTerminalPaneProps): React.ReactNode {
  const status = useSyncExternalStore(
    (onChange) => session.subscribeStatus(onChange),
    () => session.getStatus()
  )
  const restartEpoch = useSyncExternalStore(
    (onChange) => session.subscribeRestart(onChange),
    () => session.getRestartEpoch()
  )

  return (
    <div
      id={`right-terminal-pane-${id}`}
      data-testid={`right-terminal-pane-${id}`}
      role="tabpanel"
      aria-hidden={!active}
      className={`right-terminal-pane ${active ? 'is-active' : 'is-hidden'}`}
    >
      <div className="right-terminal-body">
        <LiveTerminal
          key={`${id}-${restartEpoch}`}
          session={session}
          suspended={suspended || !active}
          className="terminal-live-frame"
          fontSize={preferences.terminalFontSize}
          colorScheme={terminalColorScheme(preferences.terminalTheme)}
        />

        {status.state === 'starting' && (
          <div className="right-terminal-overlay terminal-status-starting" role="status">
            <Loader2Icon size={16} className="spin-icon" />
            <span>正在连接终端...</span>
          </div>
        )}

        {status.state === 'failed' && (
          <div className="right-terminal-overlay terminal-status-failed" role="alert">
            <AlertCircleIcon size={16} />
            <div className="terminal-status-info">
              <strong>终端启动失败</strong>
              <small>{status.error || '未知错误'}</small>
            </div>
            <button
              type="button"
              className="terminal-status-action"
              onClick={() => session.restart()}
            >
              <RefreshCwIcon size={12} />
              重试
            </button>
          </div>
        )}

        {status.state === 'exited' && (
          <div className="right-terminal-overlay terminal-status-exited" role="status">
            <CheckCircle2Icon size={16} />
            <div className="terminal-status-info">
              <span>
                {status.code === null ? '进程已结束' : `进程已退出 (代码 ${status.code})`}
              </span>
            </div>
            <button
              type="button"
              className="terminal-status-action"
              onClick={() => session.restart()}
            >
              <RefreshCwIcon size={12} />
              重新启动
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
