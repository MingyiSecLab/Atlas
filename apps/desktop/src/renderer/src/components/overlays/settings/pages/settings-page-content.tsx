import React from 'react'
import { ConnectorsSettingsPage } from './connectors/connectors-settings-page'
import { GeneralSettingsPage } from './general/general-settings-page'
import { MemorySettingsPage } from './memory/memory-settings-page'
import { NotificationsSettingsPage } from './notifications/notifications-settings-page'
import { ProviderSettingsPage } from './providers/provider-settings-page'
import { TerminalSettingsPage } from './terminal/terminal-settings-page'
import type { SettingsPage, SettingsPreferences } from '../types'

interface SettingsPageContentProps {
  page: SettingsPage
  preferences: SettingsPreferences
  modelIds: string[]
  onChange: (patch: Partial<SettingsPreferences>) => void
  onReset: () => void
  onNavigate: (page: SettingsPage) => void
}

export const SettingsPageContent: React.FC<SettingsPageContentProps> = ({
  page,
  preferences,
  modelIds,
  onChange,
  onReset,
  onNavigate
}) => {
  switch (page) {
    case 'general':
      return (
        <GeneralSettingsPage
          preferences={preferences}
          modelIds={modelIds}
          onChange={onChange}
          onReset={onReset}
          onNavigate={onNavigate}
        />
      )
    case 'terminal':
      return <TerminalSettingsPage preferences={preferences} onChange={onChange} />
    case 'notifications':
      return <NotificationsSettingsPage preferences={preferences} onChange={onChange} />
    case 'providers':
      return <ProviderSettingsPage />
    case 'connectors':
      return <ConnectorsSettingsPage preferences={preferences} onChange={onChange} />
    case 'memory':
      return <MemorySettingsPage modelIds={modelIds} />
  }
}
