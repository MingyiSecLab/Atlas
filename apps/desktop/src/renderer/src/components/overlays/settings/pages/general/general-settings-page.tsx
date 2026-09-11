import React from 'react'
import { ChevronRight, CircleAlert, KeyRound } from 'lucide-react'
import {
  SettingsPageActions,
  SettingsPageLayout,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  Toggle
} from '../../components/settings-controls'
import type { SettingsPage, SettingsPreferences } from '../../types'

interface GeneralSettingsPageProps {
  preferences: SettingsPreferences
  modelIds: string[]
  onChange: (patch: Partial<SettingsPreferences>) => void
  onReset: () => void
  onNavigate: (page: SettingsPage) => void
}

export const GeneralSettingsPage: React.FC<GeneralSettingsPageProps> = ({
  preferences,
  modelIds,
  onChange,
  onReset,
  onNavigate
}) => (
  <SettingsPageLayout label="基础设置">
    <SettingsSection title="模型配置" description="设置新任务默认使用的模型与思考强度。">
      <SettingsRow title="默认模型" description="创建新任务时优先选择此模型。">
        <SettingsSelect
          label="默认模型"
          value={preferences.defaultModel}
          onChange={(event) => onChange({ defaultModel: event.currentTarget.value })}
        >
          <option value="auto">自动选择</option>
          {modelIds.map((modelId) => (
            <option key={modelId} value={modelId}>
              {modelId}
            </option>
          ))}
        </SettingsSelect>
      </SettingsRow>
      <SettingsRow title="思考强度" description="更高强度会使用更多时间处理复杂任务。">
        <SettingsSelect
          label="思考强度"
          value={preferences.reasoningEffort}
          onChange={(event) => onChange({ reasoningEffort: event.currentTarget.value })}
        >
          <option value="fast">快速</option>
          <option value="balanced">均衡</option>
          <option value="deep">深度</option>
        </SettingsSelect>
      </SettingsRow>
      <button className="settings-link-row" type="button" onClick={() => onNavigate('providers')}>
        <KeyRound size={15} aria-hidden="true" />
        <span>管理模型服务与 API Keys</span>
        <ChevronRight size={15} aria-hidden="true" />
      </button>
    </SettingsSection>

    <SettingsSection title="安全中心" description="控制助理执行命令和访问文件时的安全边界。">
      <SettingsRow title="执行确认" description="决定命令执行前何时需要你的批准。">
        <SettingsSelect
          label="执行确认"
          value={preferences.approvalMode}
          onChange={(event) => onChange({ approvalMode: event.currentTarget.value })}
        >
          <option value="ask">敏感操作时询问</option>
          <option value="always">每次都询问</option>
          <option value="trusted">受信任模式</option>
        </SettingsSelect>
      </SettingsRow>
      <SettingsRow title="仅限工作区" description="将文件读写限制在当前项目目录内。">
        <Toggle
          label="仅限工作区"
          checked={preferences.workspaceOnly}
          onChange={(checked) => onChange({ workspaceOnly: checked })}
        />
      </SettingsRow>
      <SettingsRow title="危险操作二次确认" description="删除、覆盖和外部写入前再次确认。">
        <Toggle
          label="危险操作二次确认"
          checked={preferences.confirmDangerousActions}
          onChange={(checked) => onChange({ confirmDangerousActions: checked })}
        />
      </SettingsRow>
      <div className="settings-security-note">
        <CircleAlert size={15} aria-hidden="true" />
        <span>关闭安全保护可能允许任务修改工作区之外的文件。</span>
      </div>
    </SettingsSection>

    <SettingsPageActions>
      <button className="settings-secondary-button" type="button" onClick={onReset}>
        恢复默认设置
      </button>
    </SettingsPageActions>
  </SettingsPageLayout>
)
