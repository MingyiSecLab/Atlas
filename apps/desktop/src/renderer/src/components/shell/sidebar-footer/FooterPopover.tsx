import React, { type ReactNode, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface FooterPopoverProps {
  id: string
  title: string
  label: string
  children: ReactNode
  onClose: () => void
}

export const FooterPopover: React.FC<FooterPopoverProps> = ({
  id,
  title,
  label,
  children,
  onClose
}) => {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    panelRef.current?.focus()
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      ref={panelRef}
      id={id}
      className="sidebar-footer-popover"
      role="dialog"
      aria-label={label}
      tabIndex={-1}
    >
      <div className="sidebar-footer-popover-header">
        <div className="sidebar-footer-popover-title">{title}</div>
        <button className="sidebar-footer-close" type="button" onClick={onClose} aria-label="关闭">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {children}
    </div>
  )
}
