import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { SettingsNav } from './settings/navigation/settings-nav'
import { SettingsPageContent } from './settings/pages/settings-page-content'
import { DEFAULT_SETTINGS, readSettings, writeSettings } from './settings/persistence'
import type { SettingsPage, SettingsPreferences } from './settings/types'
import './settings/settings.css'

interface SettingsModalProps {
  isOpen: boolean
  modelIds: string[]
  onClose: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, modelIds, onClose }) => {
  const [activePage, setActivePage] = useState<SettingsPage>('general')
  const [preferences, setPreferences] = useState<SettingsPreferences>(() => readSettings())
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    requestAnimationFrame(() => closeButtonRef.current?.focus())
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    writeSettings(preferences)
  }, [preferences])

  if (!isOpen) return null

  const updatePreferences = (patch: Partial<SettingsPreferences>): void => {
    setPreferences((current) => ({ ...current, ...patch }))
    if (patch.mcpEnabled !== undefined) {
      void window.api.mcp.setAllDisabled(!patch.mcpEnabled, 'project').catch(() => undefined)
    }
  }

  return (
    <div className="settings-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-dialog app-no-drag"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <SettingsNav activePage={activePage} onSelect={setActivePage} />

        <main className="settings-main">
          <button
            ref={closeButtonRef}
            className="settings-icon-button settings-page-close"
            type="button"
            aria-label="关闭设置"
            title="关闭"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>

          <div className="settings-content" key={activePage}>
            <SettingsPageContent
              page={activePage}
              preferences={preferences}
              modelIds={modelIds}
              onChange={updatePreferences}
              onReset={() => setPreferences(DEFAULT_SETTINGS)}
              onNavigate={setActivePage}
            />
          </div>
        </main>
      </section>
    </div>
  )
}
