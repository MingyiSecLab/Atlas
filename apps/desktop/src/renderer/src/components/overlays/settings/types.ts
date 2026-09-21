export type SettingsPage =
  | 'general'
  | 'terminal'
  | 'notifications'
  | 'providers'
  | 'connectors'
  | 'memory'
  | 'about'
  | 'acknowledgements'

export interface SettingsPreferences {
  defaultModel: string
  reasoningEffort: string
  approvalMode: string
  workspaceOnly: boolean
  confirmDangerousActions: boolean
  terminalShell: string
  terminalTheme: string
  terminalFontSize: number
  notificationsEnabled: boolean
  notifyTaskComplete: boolean
  notifyApproval: boolean
  notifyError: boolean
  notificationSound: boolean
  localTerminalEnabled: boolean
  mcpEnabled: boolean
}
