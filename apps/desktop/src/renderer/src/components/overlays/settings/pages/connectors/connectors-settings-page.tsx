import React from 'react'
import { Plug } from 'lucide-react'
import {
  SettingsPageLayout,
  SettingsRow,
  SettingsSection,
  Toggle
} from '../../components/settings-controls'
import type { SettingsPreferences } from '../../types'

interface ConnectorsSettingsPageProps {
  preferences: SettingsPreferences
  onChange: (patch: Partial<SettingsPreferences>) => void
}

export const ConnectorsSettingsPage: React.FC<ConnectorsSettingsPageProps> = ({
  preferences,
  onChange
}) => (
  <SettingsPageLayout label="连接器设置">
    <SettingsSection title="连接器" description="启用后，助理可以在授权范围内调用这些能力。">
      <SettingsRow title="本地终端" description="允许任务在当前设备中执行命令。">
        <Toggle
          label="本地终端连接器"
          checked={preferences.localTerminalEnabled}
          onChange={(checked) => onChange({ localTerminalEnabled: checked })}
        />
      </SettingsRow>
      <SettingsRow title="MCP 工具" description="连接支持 Model Context Protocol 的外部工具。">
        <Toggle
          label="MCP 工具连接器"
          checked={preferences.mcpEnabled}
          onChange={(checked) => onChange({ mcpEnabled: checked })}
        />
      </SettingsRow>
      <div className="settings-connector-status">
        <Plug size={15} aria-hidden="true" />
        <span>
          {preferences.mcpEnabled ? 'MCP 已启用，等待服务器配置' : '当前仅启用本地终端能力'}
        </span>
      </div>
    </SettingsSection>
  </SettingsPageLayout>
)
