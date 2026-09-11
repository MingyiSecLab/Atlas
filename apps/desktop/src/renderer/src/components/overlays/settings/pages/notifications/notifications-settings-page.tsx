import React from 'react'
import {
  SettingsPageLayout,
  SettingsRow,
  SettingsSection,
  Toggle
} from '../../components/settings-controls'
import type { SettingsPreferences } from '../../types'

interface NotificationsSettingsPageProps {
  preferences: SettingsPreferences
  onChange: (patch: Partial<SettingsPreferences>) => void
}

export const NotificationsSettingsPage: React.FC<NotificationsSettingsPageProps> = ({
  preferences,
  onChange
}) => {
  const disabled = !preferences.notificationsEnabled

  return (
    <SettingsPageLayout label="通知设置">
      <SettingsSection title="通知总开关" description="关闭后，所有任务提醒都会停止。">
        <SettingsRow title="允许桌面通知" description="在任务状态变化时显示系统通知。">
          <Toggle
            label="允许桌面通知"
            checked={preferences.notificationsEnabled}
            onChange={(checked) => onChange({ notificationsEnabled: checked })}
          />
        </SettingsRow>
        <SettingsRow title="通知声音" description="通知到达时播放简短提示音。">
          <Toggle
            label="通知声音"
            checked={preferences.notificationSound}
            disabled={disabled}
            onChange={(checked) => onChange({ notificationSound: checked })}
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="任务事件" description="选择哪些事件值得打断你。">
        <SettingsRow title="任务完成" description="助理完成当前任务时提醒。">
          <Toggle
            label="任务完成通知"
            checked={preferences.notifyTaskComplete}
            disabled={disabled}
            onChange={(checked) => onChange({ notifyTaskComplete: checked })}
          />
        </SettingsRow>
        <SettingsRow title="等待批准" description="任务需要权限或你的选择时提醒。">
          <Toggle
            label="等待批准通知"
            checked={preferences.notifyApproval}
            disabled={disabled}
            onChange={(checked) => onChange({ notifyApproval: checked })}
          />
        </SettingsRow>
        <SettingsRow title="执行错误" description="命令失败或任务异常终止时提醒。">
          <Toggle
            label="执行错误通知"
            checked={preferences.notifyError}
            disabled={disabled}
            onChange={(checked) => onChange({ notifyError: checked })}
          />
        </SettingsRow>
      </SettingsSection>
    </SettingsPageLayout>
  )
}
