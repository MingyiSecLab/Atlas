import React from 'react'
import { TerminalSquare } from 'lucide-react'
import {
  SettingsPageLayout,
  SettingsRow,
  SettingsSection,
  SettingsSelect
} from '../../components/settings-controls'
import type { SettingsPreferences } from '../../types'

interface TerminalSettingsPageProps {
  preferences: SettingsPreferences
  onChange: (patch: Partial<SettingsPreferences>) => void
}

export const TerminalSettingsPage: React.FC<TerminalSettingsPageProps> = ({
  preferences,
  onChange
}) => (
  <SettingsPageLayout label="终端设置">
    <SettingsSection title="终端偏好" description="这些设置会应用于新建的终端标签。">
      <SettingsRow title="默认 Shell" description="跟随系统会使用当前登录 Shell。">
        <SettingsSelect
          label="默认 Shell"
          value={preferences.terminalShell}
          onChange={(event) => onChange({ terminalShell: event.currentTarget.value })}
        >
          <option value="system">跟随系统</option>
          <option value="zsh">zsh</option>
          <option value="bash">bash</option>
        </SettingsSelect>
      </SettingsRow>
      <SettingsRow title="配色主题" description="控制终端背景与语法颜色。">
        <SettingsSelect
          label="终端配色主题"
          value={preferences.terminalTheme}
          onChange={(event) => onChange({ terminalTheme: event.currentTarget.value })}
        >
          <option value="system">跟随应用</option>
          <option value="light">浅色</option>
          <option value="dark">深色</option>
        </SettingsSelect>
      </SettingsRow>
      <SettingsRow title="字体大小" description="调整终端文本，不影响其他界面。">
        <div className="settings-range-control">
          <input
            type="range"
            min="11"
            max="18"
            step="1"
            aria-label="终端字体大小"
            value={preferences.terminalFontSize}
            onChange={(event) => onChange({ terminalFontSize: Number(event.currentTarget.value) })}
          />
          <output>{preferences.terminalFontSize}px</output>
        </div>
      </SettingsRow>
      <div className="settings-terminal-preview" aria-label="终端预览">
        <div>
          <TerminalSquare size={14} aria-hidden="true" /> terminal
        </div>
        <code style={{ fontSize: preferences.terminalFontSize }}>
          mingyi % npm run dev<span>_</span>
        </code>
      </div>
    </SettingsSection>
  </SettingsPageLayout>
)
