import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import type { PtyTransport } from 'restty'
import { Restty } from 'restty'
import type { TerminalSession } from './session'
import { resolveTerminalFonts } from './fonts'
import type { TerminalColorScheme } from './prefs'
import {
  DEFAULT_TERMINAL_COLOR_SCHEME,
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE
} from './prefs'
import { applyTerminalTheme } from './terminal-theme'

// Terminal tabs stay mounted (visibility-toggled) while N tabs are open, so share one
// MutationObserver for the `.dark` class flip across all instances instead of one per terminal.
const themeChangeListeners = new Set<() => void>()
let themeChangeObserver: MutationObserver | null = null
const ignoreTerminalResize: (cols: number, rows: number) => void = () => undefined

function subscribeThemeChange(listener: () => void): () => void {
  themeChangeListeners.add(listener)
  if (!themeChangeObserver) {
    themeChangeObserver = new MutationObserver(() => {
      for (const fn of themeChangeListeners) fn()
    })
    themeChangeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })
  }
  return () => {
    themeChangeListeners.delete(listener)
    if (themeChangeListeners.size === 0) {
      themeChangeObserver?.disconnect()
      themeChangeObserver = null
    }
  }
}

function createSessionPtyTransport(
  session: TerminalSession,
  applyHostResize: (cols: number, rows: number) => void
): PtyTransport {
  let unsubscribe: (() => void) | null = null
  let connected = false
  let applyingHostResize = false
  const close = (): void => {
    connected = false
    unsubscribe?.()
    unsubscribe = null
  }
  return {
    connect({ callbacks }) {
      close()
      const state = { exited: false }
      const nextUnsubscribe = session.subscribe(
        (event) => {
          if (event.type === 'write') {
            callbacks.onData?.(event.data)
            return
          }
          applyingHostResize = true
          try {
            applyHostResize(event.cols, event.rows)
          } finally {
            applyingHostResize = false
          }
        },
        (code) => {
          state.exited = true
          connected = false
          callbacks.onExit?.(code ?? 0)
        }
      )
      if (state.exited) {
        nextUnsubscribe()
        return
      }
      unsubscribe = nextUnsubscribe
      connected = true
      callbacks.onConnect?.()
    },
    disconnect: close,
    destroy: close,
    sendInput(data) {
      if (session.canControl()) session.sendInput(data)
      return true
    },
    resize(cols, rows) {
      if (!applyingHostResize && session.canControl()) session.resize(cols, rows)
      return true
    },
    isConnected: () => connected
  }
}

/**
 * Interactive restty terminal fed from a TerminalSession; presentation-only.
 * `suspended` freezes the box at its current pixel size while the host panel animates,
 * so restty's ResizeObserver never sees transient sizes — each PTY resize would stack
 * a blank prompt line.
 */
export function LiveTerminal({
  session,
  suspended = false,
  className = '',
  fontFamily = DEFAULT_TERMINAL_FONT_FAMILY,
  fontSize = DEFAULT_TERMINAL_FONT_SIZE,
  colorScheme = DEFAULT_TERMINAL_COLOR_SCHEME
}: {
  session: TerminalSession
  suspended?: boolean
  className?: string
  fontFamily?: string
  fontSize?: number
  colorScheme?: TerminalColorScheme
}): React.ReactNode {
  const frameRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Restty | null>(null)
  const subscribeReplayTruncated = useCallback(
    (onChange: () => void) => session.subscribeReplayTruncated(onChange),
    [session]
  )
  const replayTruncated = useSyncExternalStore(
    subscribeReplayTruncated,
    () => session.replayWasTruncated(),
    () => false
  )

  // Layout effect so the freeze lands before the panel's first shrink frame paints. Freeze only
  // when the content box has real extent: a collapsed mount measures 0 (the frame still reports
  // its padding), and pinning that would trap restty at birth size.
  useLayoutEffect(() => {
    const frame = frameRef.current
    const container = containerRef.current
    if (!frame || !container) return
    if (suspended) {
      const content = container.getBoundingClientRect()
      if (content.width === 0 || content.height === 0) return
      const rect = frame.getBoundingClientRect()
      frame.style.width = `${rect.width}px`
      frame.style.height = `${rect.height}px`
    } else {
      frame.style.removeProperty('width')
      frame.style.removeProperty('height')
    }
  }, [suspended])

  useEffect(() => {
    const frame = frameRef.current
    const container = containerRef.current
    if (!frame || !container) return
    if ('start' in session && typeof session.start === 'function') session.start()

    let revealFrame = 0
    let revealPaintFrame = 0
    let cancelled = false
    let destroy = (): void => undefined
    let unsubscribeController = (): void => undefined
    let disconnectContainerResize = (): void => undefined
    const hostResize = { apply: ignoreTerminalResize }

    void (async () => {
      const fonts = await resolveTerminalFonts(fontFamily)
      if (cancelled) return
      const terminal = new Restty({
        root: container,
        // Init manually: connectPty must land only once the renderer core is ready, or the
        // replayed initial prompt is dropped before the WASM terminal can render it.
        // shortcuts off: restty's unscoped Cmd/Ctrl+D pane splitter would fire per mounted terminal.
        // contextMenu null: disable right-click menu (which includes split-pane actions).
        // createInitialPane false: we manage pane lifecycle; restty shouldn't auto-create one.
        surface: {
          autoInit: false,
          shortcuts: false,
          contextMenu: null,
          createInitialPane: false
        },
        // fontSizeMode 'em' makes fontSize the glyph em size (like every other terminal);
        // restty's default 'height' mode reads it as full line height — ~30% smaller glyphs.
        terminal: {
          autoResize: false,
          fonts,
          fontSize,
          fontSizeMode: 'em',
          forwardTerminalReplies: false
        },
        services: {
          beforeInput: () => (session.canControl() ? undefined : null),
          ptyTransport: createSessionPtyTransport(session, (cols, rows) =>
            hostResize.apply(cols, rows)
          )
        }
      })
      let terminalDestroyed = false
      destroy = () => {
        if (terminalDestroyed) return
        terminalDestroyed = true
        terminal.destroy()
      }
      if (cancelled) {
        destroy()
        return
      }
      // Manually create the first pane since we disabled createInitialPane in surface config.
      const createdPane = terminal.createInitialPane({ focus: false })
      if (!createdPane.runtime) return
      const pane = createdPane
      await pane.runtime.lifecycle.init()
      if (cancelled) {
        destroy()
        return
      }
      const initialSize = session.initialSize()
      if (initialSize) {
        pane.runtime.interaction.resize(initialSize.cols, initialSize.rows)
      }
      hostResize.apply = (cols, rows) => pane.runtime.interaction.resize(cols, rows)
      terminalRef.current = terminal
      applyTerminalTheme(terminal, frame, colorScheme)
      terminal.connectPty('session://terminal')
      const containerResize = new ResizeObserver(() => {
        if (session.canControl()) terminal.updateSize()
      })
      containerResize.observe(container)
      disconnectContainerResize = () => containerResize.disconnect()
      unsubscribeController = session.subscribeController((canControl) => {
        if (canControl) terminal.updateSize(true)
      })
      if (session.canControl()) terminal.updateSize(true)
      // Reveal only once a themed frame can be painted, so the default black frames restty
      // draws while the WASM core boots are never shown.
      // A themed Restty canvas needs one full paint before it can be exposed. Waiting for the
      // following frame prevents Chromium from briefly compositing WebGL's default black buffer.
      revealFrame = requestAnimationFrame(() => {
        revealPaintFrame = requestAnimationFrame(() => {
          frame.style.opacity = '1'
          frame.dataset.terminalReady = ''
        })
      })
    })()

    return () => {
      cancelled = true
      cancelAnimationFrame(revealFrame)
      cancelAnimationFrame(revealPaintFrame)
      disconnectContainerResize()
      unsubscribeController()
      terminalRef.current = null
      destroy()
    }
    // Preferences are applied live below; including them here would restart the PTY renderer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  useEffect(() => {
    terminalRef.current?.setFontSize(fontSize)
  }, [fontSize])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    let cancelled = false
    void resolveTerminalFonts(fontFamily).then((fonts) => {
      if (!cancelled && terminalRef.current === terminal) void terminal.setFonts(fonts)
    })
    return () => {
      cancelled = true
    }
  }, [fontFamily])

  useEffect(() => {
    const apply = (): void => {
      if (terminalRef.current) {
        applyTerminalTheme(terminalRef.current, frameRef.current, colorScheme)
      }
    }
    apply()
    return subscribeThemeChange(apply)
  }, [colorScheme])

  // Padding lives on the frame, never on the restty root: restty sizes its canvas from the root's
  // clientWidth/clientHeight, which include padding, so a padded root would overflow into the inset.
  return (
    <div
      ref={frameRef}
      data-keyboard-shortcut-local=""
      className={className}
      style={{
        position: 'relative',
        padding: 8,
        opacity: 0,
        transition: 'opacity 90ms ease-out',
        boxSizing: 'border-box'
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {replayTruncated && (
        <div
          style={{
            position: 'absolute',
            right: 12,
            bottom: 12,
            borderRadius: 6,
            border: '1px solid rgba(0,0,0,0.08)',
            background: 'rgba(255,255,255,0.95)',
            padding: '2px 8px',
            color: '#71717a',
            fontSize: 11,
            pointerEvents: 'none'
          }}
        >
          终端历史已截断
        </div>
      )}
    </div>
  )
}
