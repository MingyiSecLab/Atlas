import React, { useEffect, useState } from 'react'
import { CircleAlert, RotateCcw } from 'lucide-react'
import {
  SettingsPageActions,
  SettingsPageLayout,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  Toggle
} from '../../components/settings-controls'
import type { RuntimeOmStatus, UpdateRuntimeOmInput } from '@mingyi/runtime'

const OM_DEFAULTS: RuntimeOmStatus = {
  observerModelId: 'google/gemini-3.5-flash',
  reflectorModelId: 'google/gemini-3.5-flash',
  observationThreshold: 30_000,
  reflectionThreshold: 40_000,
  cavemanObservations: false,
  observeAttachments: 'auto',
  omScope: 'thread'
}

interface MemorySettingsPageProps {
  modelIds: string[]
}

/** Observational Memory 设置页：读写 Runtime Controller state 的 OM 旋钮。 */
export const MemorySettingsPage: React.FC<MemorySettingsPageProps> = ({ modelIds }) => {
  const [status, setStatus] = useState<RuntimeOmStatus>(OM_DEFAULTS)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api.om
      .getStatus()
      .then((next) => {
        if (!cancelled) setStatus(next)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : '读取记忆配置失败。')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const update = async (patch: UpdateRuntimeOmInput): Promise<void> => {
    setSaving(true)
    setSaveError(null)
    try {
      const next = await window.api.om.update(patch)
      setStatus(next)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存记忆配置失败。')
    } finally {
      setSaving(false)
    }
  }

  const modelOptions = (value: string): React.ReactNode => (
    <>
      {value !== OM_DEFAULTS.observerModelId && !modelIds.includes(value) && (
        <option key={value} value={value}>
          {value}
        </option>
      )}
      {modelIds.map((modelId) => (
        <option key={modelId} value={modelId}>
          {modelId}
        </option>
      ))}
    </>
  )

  return (
    <SettingsPageLayout label="记忆设置">
      {loadError && (
        <div className="settings-security-note" role="alert">
          <CircleAlert size={15} aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}

      <SettingsSection
        title="观察记忆"
        description="Mastra Observational Memory 在后台把冗长的历史对话压缩为观察日志，保持长会话上下文可控。修改立即生效，无需重启。"
      >
        <SettingsRow
          title="观察者模型"
          description="负责把原始消息历史压缩成观察日志；推荐长上下文且响应快的模型。"
        >
          <SettingsSelect
            label="观察者模型"
            value={status.observerModelId}
            disabled={saving}
            onChange={(event) => void update({ observerModelId: event.currentTarget.value })}
          >
            {modelOptions(status.observerModelId)}
          </SettingsSelect>
        </SettingsRow>
        <SettingsRow
          title="反思者模型"
          description="观察日志过长时由它整体重写压缩；可与观察者使用不同模型。"
        >
          <SettingsSelect
            label="反思者模型"
            value={status.reflectorModelId}
            disabled={saving}
            onChange={(event) => void update({ reflectorModelId: event.currentTarget.value })}
          >
            {modelOptions(status.reflectorModelId)}
          </SettingsSelect>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="压缩阈值"
        description="数值越大保留越多原文，消耗更多上下文；越小压缩越激进。"
      >
        <SettingsRow
          title="观察阈值"
          description="消息历史达到该 token 数时触发观察压缩（默认 30000）。"
        >
          <input
            className="settings-number-input"
            type="number"
            min={1000}
            step={1000}
            aria-label="观察阈值"
            value={status.observationThreshold}
            disabled={saving}
            onChange={(event) => {
              const parsed = Number.parseInt(event.currentTarget.value, 10)
              if (Number.isFinite(parsed) && parsed > 0) {
                setStatus((current) => ({ ...current, observationThreshold: parsed }))
              }
            }}
            onBlur={(event) => {
              const parsed = Number.parseInt(event.currentTarget.value, 10)
              if (Number.isFinite(parsed) && parsed > 0 && parsed !== status.observationThreshold) {
                void update({ observationThreshold: parsed })
              }
            }}
          />
        </SettingsRow>
        <SettingsRow
          title="反思阈值"
          description="观察日志达到该 token 数时触发反思重写（默认 40000）。"
        >
          <input
            className="settings-number-input"
            type="number"
            min={1000}
            step={1000}
            aria-label="反思阈值"
            value={status.reflectionThreshold}
            disabled={saving}
            onChange={(event) => {
              const parsed = Number.parseInt(event.currentTarget.value, 10)
              if (Number.isFinite(parsed) && parsed > 0) {
                setStatus((current) => ({ ...current, reflectionThreshold: parsed }))
              }
            }}
            onBlur={(event) => {
              const parsed = Number.parseInt(event.currentTarget.value, 10)
              if (Number.isFinite(parsed) && parsed > 0 && parsed !== status.reflectionThreshold) {
                void update({ reflectionThreshold: parsed })
              }
            }}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="高级选项" description="控制观察日志风格与多模态内容处理。">
        <SettingsRow
          title="极简观察风格"
          description="观察日志使用电报式短句压缩，显著减少 token 但丢失细节。"
        >
          <Toggle
            label="极简观察风格"
            checked={status.cavemanObservations}
            disabled={saving}
            onChange={(checked) => void update({ cavemanObservations: checked })}
          />
        </SettingsRow>
        <SettingsRow
          title="附件观察"
          description="观察者是否查看对话中的图片与文件；自动模式下按模型能力决定。"
        >
          <SettingsSelect
            label="附件观察"
            value={String(status.observeAttachments)}
            disabled={saving}
            onChange={(event) => {
              const { value } = event.currentTarget
              void update({
                observeAttachments: value === 'auto' ? 'auto' : value === 'true'
              })
            }}
          >
            <option value="auto">自动</option>
            <option value="true">始终发送</option>
            <option value="false">不发送</option>
          </SettingsSelect>
        </SettingsRow>
        <SettingsRow
          title="记忆作用域"
          description="thread 为每个会话独立记忆；resource 为跨会话共享记忆（实验性）。"
        >
          <SettingsSelect
            label="记忆作用域"
            value={status.omScope}
            disabled={saving}
            onChange={(event) =>
              void update({ scope: event.currentTarget.value as 'thread' | 'resource' })
            }
          >
            <option value="thread">单会话（thread）</option>
            <option value="resource">跨会话（resource，实验性）</option>
          </SettingsSelect>
        </SettingsRow>
      </SettingsSection>

      {saveError && (
        <div className="settings-security-note" role="alert">
          <CircleAlert size={15} aria-hidden="true" />
          <span>{saveError}</span>
        </div>
      )}

      <SettingsPageActions>
        <button
          className="settings-secondary-button"
          type="button"
          disabled={saving}
          onClick={() =>
            void update({
              observationThreshold: OM_DEFAULTS.observationThreshold,
              reflectionThreshold: OM_DEFAULTS.reflectionThreshold,
              cavemanObservations: OM_DEFAULTS.cavemanObservations,
              observeAttachments: OM_DEFAULTS.observeAttachments,
              scope: OM_DEFAULTS.omScope
            })
          }
        >
          <RotateCcw size={14} aria-hidden="true" />
          恢复默认参数
        </button>
      </SettingsPageActions>
    </SettingsPageLayout>
  )
}
