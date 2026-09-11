import type { SettingsPreferences } from './types'

const SETTINGS_KEY = 'mingyi_settings_preferences'
export const SETTINGS_CHANGED_EVENT = 'mingyi-settings-changed'

export const DEFAULT_SETTINGS: SettingsPreferences = {
  defaultModel: 'auto',
  reasoningEffort: 'balanced',
  approvalMode: 'ask',
  workspaceOnly: true,
  confirmDangerousActions: true,
  terminalShell: 'system',
  terminalTheme: 'system',
  terminalFontSize: 13,
  notificationsEnabled: true,
  notifyTaskComplete: true,
  notifyApproval: true,
  notifyError: true,
  notificationSound: true,
  localTerminalEnabled: true,
  mcpEnabled: false
}

export function readSettings(): SettingsPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')
    return { ...DEFAULT_SETTINGS, ...stored }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function writeSettings(settings: SettingsPreferences): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Settings remain available for the current session when persistence is restricted.
  }
  window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT, { detail: settings }))
}
