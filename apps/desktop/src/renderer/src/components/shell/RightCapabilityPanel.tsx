import React, { useRef, useState } from 'react'
import type { RightPanelSection } from './right-panel-vocabulary'
import { BrowserView } from './browser'
import { RightTerminalView } from './terminal'
import { PentestView } from './pentest'
import { AuditView } from './audit'
import { FilesView } from './files/FilesView'

interface RightCapabilityPanelProps {
  activeSection: RightPanelSection
  isExpanded: boolean
  width: number
  /** 当前会话（task）ID：渗透面板据此绑定该会话的 engagement。 */
  taskId: string | null
  onResize: (width: number) => void
  onSelectSection: (section: RightPanelSection) => void
}

const MIN_PANEL_WIDTH = 320
const MAX_PANEL_WIDTH = 640

function clampPanelWidth(value: number): number {
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, value))
}

export const RightCapabilityPanel: React.FC<RightCapabilityPanelProps> = ({
  activeSection,
  isExpanded,
  width,
  taskId,
  onResize
}) => {
  const [isResizing, setIsResizing] = useState(false)
  const panelRef = useRef<HTMLElement>(null)

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (isExpanded) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsResizing(true)
  }

  const handleResizeMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!isResizing || isExpanded) return
    const container = panelRef.current?.parentElement
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const rawWidth = containerRect.right - event.clientX
    onResize(clampPanelWidth(rawWidth))
  }

  const handleResizeEnd = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!isResizing) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setIsResizing(false)
  }

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (isExpanded) return
    const step = event.shiftKey ? 40 : 10
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onResize(clampPanelWidth(width + step))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onResize(clampPanelWidth(width - step))
    } else if (event.key === 'Home') {
      event.preventDefault()
      onResize(MAX_PANEL_WIDTH)
    } else if (event.key === 'End') {
      event.preventDefault()
      onResize(MIN_PANEL_WIDTH)
    }
  }

  return (
    <aside
      ref={panelRef}
      className={`right-capability-panel ${isExpanded ? 'is-expanded' : ''}`}
      style={
        isExpanded ? undefined : ({ '--right-panel-width': `${width}px` } as React.CSSProperties)
      }
      data-testid="right-capability-panel"
      aria-label="右侧能力工作台"
    >
      <div
        role="separator"
        className={`right-panel-resize-handle ${isResizing ? 'is-resizing' : ''}`}
        aria-label="调整右侧工作台宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_PANEL_WIDTH}
        aria-valuemax={MAX_PANEL_WIDTH}
        aria-valuenow={width}
        tabIndex={isExpanded ? -1 : 0}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        onKeyDown={handleResizeKeyDown}
      />
      <div className="right-panel-titlebar-spacer" aria-hidden="true" />
      <div className="right-panel-content">
        {activeSection === 'terminal' ? <RightTerminalView /> : null}
        {activeSection === 'browser' ? <BrowserView /> : null}
        {activeSection === 'files' ? <FilesView /> : null}
        {activeSection === 'pentest' ? <PentestView taskId={taskId} /> : null}
        {activeSection === 'audit' ? <AuditView /> : null}
      </div>
    </aside>
  )
}
