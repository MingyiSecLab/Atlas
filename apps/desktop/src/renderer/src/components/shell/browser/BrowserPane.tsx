import React, { useEffect, useRef, useState, useId } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Compass,
  Globe,
  MoreVertical,
  RotateCw,
  Search,
  X,
  AlertCircle
} from 'lucide-react'
import type { BrowserFindState, WebviewNavState } from './types'
import { isAllowedBrowserUrl, normalizeBrowserUrl } from './normalize'

const BROWSER_PARTITION = 'persist:mingyi-browser'
const MIN_ZOOM_LEVEL = -8
const MAX_ZOOM_LEVEL = 9

interface DidNavigateEvent extends Event {
  url?: string
}

interface PageTitleUpdatedEvent extends Event {
  title?: string
}

interface DidFailLoadEvent extends Event {
  errorCode?: number
  errorDescription?: string
  isMainFrame?: boolean
}

interface FoundInPageEvent extends Event {
  result?: {
    activeMatchOrdinal: number
    matches: number
  }
}

interface WebviewElement extends HTMLElement {
  isLoading(): boolean
  canGoBack(): boolean
  canGoForward(): boolean
  getURL(): string
  getTitle(): string
  goBack(): void
  goForward(): void
  reload(): void
  getZoomLevel(): number
  setZoomLevel(level: number): void
  openDevTools(): void
  findInPage(text: string, options?: { forward?: boolean; findNext?: boolean }): number
  stopFindInPage(action: 'clearSelection' | 'keepSelection' | 'activateSelection'): void
}

interface BrowserPaneProps {
  tabId: string
  url: string | null
  isActive: boolean
  onNavigate: (url: string) => void
  onTitleChange?: (title: string) => void
}

const IDLE_NAV: WebviewNavState = {
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  failure: null,
  guestReady: false
}

const QUICK_LINKS = [
  { label: 'Localhost (5174)', url: 'http://localhost:5174' },
  { label: 'Localhost (3000)', url: 'http://localhost:3000' },
  { label: 'Localhost (8080)', url: 'http://localhost:8080' },
  { label: 'Example.com', url: 'https://example.com' }
]

export const BrowserPane: React.FC<BrowserPaneProps> = ({
  url,
  isActive,
  onNavigate,
  onTitleChange
}) => {
  const [addressInput, setAddressInput] = useState(url ?? '')
  const [prevUrl, setPrevUrl] = useState(url)
  if (url !== prevUrl) {
    setPrevUrl(url)
    setAddressInput(url ?? '')
  }

  const [nav, setNav] = useState<WebviewNavState>(IDLE_NAV)
  const [find, setFind] = useState<BrowserFindState | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const webviewRef = useRef<WebviewElement | null>(null)
  const findInputId = useId()

  // Close menu when clicking outside
  useEffect(() => {
    if (!isMenuOpen) return
    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen])

  // Bind Webview lifecycle & events
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    let ready = false

    const syncNav = (): void => {
      if (!ready) return
      try {
        setNav((prev) => ({
          ...prev,
          isLoading: Boolean(webview.isLoading?.()),
          canGoBack: Boolean(webview.canGoBack?.()),
          canGoForward: Boolean(webview.canGoForward?.())
        }))
      } catch {
        // ignore detached probe
      }
    }

    const syncDocument = (): void => {
      ready = true
      try {
        const curUrl = webview.getURL?.() || ''
        const curTitle = webview.getTitle?.() || ''
        setNav((prev) => ({
          ...prev,
          isLoading: Boolean(webview.isLoading?.()),
          canGoBack: Boolean(webview.canGoBack?.()),
          canGoForward: Boolean(webview.canGoForward?.()),
          guestReady: true
        }))
        if (curUrl && curUrl !== url) {
          setAddressInput(curUrl)
        }
        if (curTitle && onTitleChange) {
          onTitleChange(curTitle)
        }
      } catch {
        // ignore
      }
    }

    const onStartLoading = (): void => {
      setNav((prev) => ({ ...prev, isLoading: true, failure: null }))
    }

    const onStopLoading = (): void => {
      syncDocument()
    }

    const onDomReady = (): void => {
      syncDocument()
    }

    const onDidNavigate = (event: Event): void => {
      const navEvent = event as DidNavigateEvent
      if (navEvent.url) {
        setAddressInput(navEvent.url)
        onNavigate(navEvent.url)
      }
      setNav((prev) => ({ ...prev, failure: null }))
      syncNav()
    }

    const onPageTitleUpdated = (event: Event): void => {
      const titleEvent = event as PageTitleUpdatedEvent
      if (titleEvent.title && onTitleChange) {
        onTitleChange(titleEvent.title)
      }
    }

    const onDidFailLoad = (event: Event): void => {
      const failEvent = event as DidFailLoadEvent
      if (failEvent.errorCode === -3 || !failEvent.isMainFrame) return // -3 = cancelled
      setNav((prev) => ({
        ...prev,
        isLoading: false,
        failure: `加载失败：${failEvent.errorDescription || '无法连接到服务器'}`
      }))
    }

    const onFoundInPage = (event: Event): void => {
      const foundEvent = event as FoundInPageEvent
      if (!foundEvent.result) return
      const result = foundEvent.result
      setFind((prev) =>
        prev === null
          ? prev
          : {
              ...prev,
              matches: {
                active: result.activeMatchOrdinal,
                total: result.matches
              }
            }
      )
    }

    webview.addEventListener('did-start-loading', onStartLoading)
    webview.addEventListener('did-stop-loading', onStopLoading)
    webview.addEventListener('dom-ready', onDomReady)
    webview.addEventListener('did-navigate', onDidNavigate)
    webview.addEventListener('did-navigate-in-page', onDidNavigate)
    webview.addEventListener('page-title-updated', onPageTitleUpdated)
    webview.addEventListener('did-fail-load', onDidFailLoad)
    webview.addEventListener('found-in-page', onFoundInPage)

    try {
      if (webview.getURL?.() && !webview.isLoading?.()) {
        syncDocument()
      }
    } catch {
      // ignore
    }

    return () => {
      webview.removeEventListener('did-start-loading', onStartLoading)
      webview.removeEventListener('did-stop-loading', onStopLoading)
      webview.removeEventListener('dom-ready', onDomReady)
      webview.removeEventListener('did-navigate', onDidNavigate)
      webview.removeEventListener('did-navigate-in-page', onDidNavigate)
      webview.removeEventListener('page-title-updated', onPageTitleUpdated)
      webview.removeEventListener('did-fail-load', onDidFailLoad)
      webview.removeEventListener('found-in-page', onFoundInPage)
    }
  }, [url, onNavigate, onTitleChange])

  const commitAddress = (rawValue: string): void => {
    const normalized = normalizeBrowserUrl(rawValue)
    if (normalized.length > 0 && isAllowedBrowserUrl(normalized)) {
      setAddressInput(normalized)
      onNavigate(normalized)
    }
  }

  const handleBack = (): void => {
    try {
      if (webviewRef.current?.canGoBack?.()) {
        webviewRef.current.goBack()
      }
    } catch {
      // ignore
    }
  }

  const handleForward = (): void => {
    try {
      if (webviewRef.current?.canGoForward?.()) {
        webviewRef.current.goForward()
      }
    } catch {
      // ignore
    }
  }

  const handleReload = (): void => {
    try {
      if (webviewRef.current?.reload) {
        webviewRef.current.reload()
      } else if (url) {
        onNavigate(url)
      }
    } catch {
      // ignore
    }
  }

  const handleZoom = (action: 'in' | 'out' | 'reset'): void => {
    try {
      const webview = webviewRef.current
      if (!webview?.getZoomLevel) return
      const current = webview.getZoomLevel()
      if (action === 'in') {
        webview.setZoomLevel(Math.min(current + 1, MAX_ZOOM_LEVEL))
      } else if (action === 'out') {
        webview.setZoomLevel(Math.max(current - 1, MIN_ZOOM_LEVEL))
      } else {
        webview.setZoomLevel(0)
      }
    } catch {
      // ignore
    }
    setIsMenuOpen(false)
  }

  const handleOpenDevTools = (): void => {
    try {
      webviewRef.current?.openDevTools?.()
    } catch {
      // ignore
    }
    setIsMenuOpen(false)
  }

  const openFind = (): void => {
    setFind((prev) => prev ?? { query: '', matches: null })
    setIsMenuOpen(false)
  }

  const closeFind = (): void => {
    try {
      webviewRef.current?.stopFindInPage?.('clearSelection')
    } catch {
      // ignore
    }
    setFind(null)
  }

  const handleFindQueryChange = (query: string): void => {
    setFind({ query, matches: null })
    try {
      if (query.length > 0) {
        webviewRef.current?.findInPage?.(query)
      } else {
        webviewRef.current?.stopFindInPage?.('clearSelection')
      }
    } catch {
      // ignore
    }
  }

  const handleFindStep = (forward: boolean): void => {
    try {
      if (find && find.query.length > 0) {
        webviewRef.current?.findInPage?.(find.query, { forward, findNext: true })
      }
    } catch {
      // ignore
    }
  }

  // Keyboard shortcut handler (when pane is active)
  useEffect(() => {
    if (!isActive) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        openFind()
      } else if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        handleZoom('in')
      } else if ((e.metaKey || e.ctrlKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault()
        handleZoom('out')
      } else if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault()
        handleZoom('reset')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive])

  return (
    <div
      className={`browser-pane-container ${isActive ? 'is-active' : ''}`}
      style={{ display: isActive ? 'flex' : 'none' }}
    >
      {/* Top Navigation & Omnibox Toolbar */}
      <div className="browser-toolbar">
        <button
          type="button"
          className="browser-nav-btn"
          aria-label="后退"
          title="后退"
          disabled={!nav.canGoBack}
          onClick={handleBack}
        >
          <ArrowLeft size={14} />
        </button>

        <button
          type="button"
          className="browser-nav-btn"
          aria-label="前进"
          title="前进"
          disabled={!nav.canGoForward}
          onClick={handleForward}
        >
          <ArrowRight size={14} />
        </button>

        <button
          type="button"
          className={`browser-nav-btn ${nav.isLoading ? 'is-loading' : ''}`}
          aria-label="刷新"
          title="刷新页面"
          disabled={!url}
          onClick={handleReload}
        >
          <RotateCw size={13} className={nav.isLoading ? 'spin-icon' : ''} />
        </button>

        {/* Omnibox URL pill */}
        <div className="browser-omnibox">
          <Globe size={13} className="browser-omnibox-icon" />
          <input
            type="text"
            className="browser-omnibox-input"
            placeholder="输入网址或搜索 (例如 localhost:5174)"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitAddress(addressInput)
              }
            }}
            spellCheck={false}
          />
          {addressInput.length > 0 && (
            <button
              type="button"
              className="browser-omnibox-clear"
              title="清除"
              onClick={() => {
                setAddressInput('')
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Page Actions Menu */}
        <div className="browser-menu-wrapper" ref={menuRef}>
          <button
            type="button"
            className="browser-nav-btn"
            aria-label="页面选项"
            title="更多选项"
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            <MoreVertical size={14} />
          </button>

          {isMenuOpen && (
            <div className="browser-dropdown-menu animate-fade-in" role="menu">
              <button
                type="button"
                className="browser-menu-item"
                disabled={!url}
                onClick={openFind}
              >
                <span>查找页面内容</span>
                <kbd>⌘F</kbd>
              </button>
              <div className="browser-menu-divider" />
              <button
                type="button"
                className="browser-menu-item"
                disabled={!url}
                onClick={() => handleZoom('in')}
              >
                <span>放大</span>
                <kbd>⌘+</kbd>
              </button>
              <button
                type="button"
                className="browser-menu-item"
                disabled={!url}
                onClick={() => handleZoom('out')}
              >
                <span>缩小</span>
                <kbd>⌘-</kbd>
              </button>
              <button
                type="button"
                className="browser-menu-item"
                disabled={!url}
                onClick={() => handleZoom('reset')}
              >
                <span>重置缩放</span>
                <kbd>⌘0</kbd>
              </button>
              <div className="browser-menu-divider" />
              <button
                type="button"
                className="browser-menu-item"
                disabled={!url}
                onClick={handleOpenDevTools}
              >
                <span>打开开发者工具</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Find in Page Bar */}
      {find !== null && (
        <div className="browser-find-bar animate-fade-in">
          <Search size={13} className="browser-find-icon" />
          <input
            id={findInputId}
            autoFocus
            type="text"
            className="browser-find-input"
            placeholder="在页面中查找..."
            value={find.query}
            onChange={(e) => handleFindQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleFindStep(!e.shiftKey)
              } else if (e.key === 'Escape') {
                closeFind()
              }
            }}
          />
          {find.matches !== null && (
            <span className="browser-find-count">
              {find.matches.total > 0 ? `${find.matches.active} / ${find.matches.total}` : '无匹配'}
            </span>
          )}
          <button
            type="button"
            className="browser-find-btn"
            disabled={!find.matches || find.matches.total === 0}
            title="上一个 (Shift+Enter)"
            onClick={() => handleFindStep(false)}
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            className="browser-find-btn"
            disabled={!find.matches || find.matches.total === 0}
            title="下一个 (Enter)"
            onClick={() => handleFindStep(true)}
          >
            <ChevronDown size={13} />
          </button>
          <button type="button" className="browser-find-btn" title="关闭 (Esc)" onClick={closeFind}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* Main Canvas */}
      <div className="browser-surface">
        {url ? (
          React.createElement('webview', {
            ref: webviewRef,
            src: url,
            partition: BROWSER_PARTITION,
            allowpopups: 'true',
            className: 'browser-webview-element'
          })
        ) : (
          <div className="browser-empty-state">
            <div className="browser-empty-icon-wrap">
              <Compass size={32} />
            </div>
            <h3>输入 URL 开启网页预览</h3>
            <p>在地址栏输入任意网址，或选择快捷地址：</p>
            <div className="browser-quick-links">
              {QUICK_LINKS.map((link) => (
                <button
                  type="button"
                  key={link.url}
                  className="browser-quick-chip"
                  onClick={() => {
                    setAddressInput(link.url)
                    onNavigate(link.url)
                  }}
                >
                  <Globe size={11} />
                  <span>{link.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Load Failure Toast Banner */}
        {nav.failure && url && (
          <div className="browser-failure-banner animate-fade-in">
            <AlertCircle size={14} className="browser-failure-icon" />
            <span className="browser-failure-msg">{nav.failure}</span>
            <button type="button" className="browser-failure-retry" onClick={handleReload}>
              重试
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
