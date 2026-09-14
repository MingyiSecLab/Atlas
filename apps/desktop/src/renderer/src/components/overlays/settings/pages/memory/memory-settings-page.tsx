import React, { useEffect, useId, useState } from 'react'
import { Check, CircleAlert, RotateCcw, Sparkles } from 'lucide-react'
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
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)
  const [syncReflector, setSyncReflector] = useState(true)
  const syncToggleId = useId()

  useEffect(() => {
    let cancelled = false
    window.api.om
      .getStatus()
      .then((next) => {
        if (!cancelled) {
          setStatus(next)
          if (next.reflectorModelId && next.observerModelId) {
            setSyncReflector(next.reflectorModelId === next.observerModelId)
          }
        }
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
      setSaveFeedback('已自动保存配置')
      setTimeout(() => {
        setSaveFeedback(null)
      }, 2000)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存记忆配置失败。')
    } finally {
      setSaving(false)
    }
  }

  // 检查是否缺少 Google 凭证却在使用默认的 Gemini 模型
  const hasGoogleKey = modelIds.some((id) => id.startsWith('google/'))
  const currentObserverUsesGoogle =
    !status.observerModelId || status.observerModelId.startsWith('google/')
  const currentReflectorUsesGoogle =
    !status.reflectorModelId || status.reflectorModelId.startsWith('google/')
  const isMissingGoogleKeyWarning =
    !hasGoogleKey && (currentObserverUsesGoogle || currentReflectorUsesGoogle)

  const handleObserverChange = (newModel: string): void => {
    const patch: UpdateRuntimeOmInput = { observerModelId: newModel }
    if (syncReflector) {
      patch.reflectorModelId = newModel
    }
    void update(patch)
  }

  const handleApplyRecommended = (): void => {
    if (modelIds.length === 0) return
    const primaryModel = modelIds[0]
    void update({
      observerModelId: primaryModel,
      reflectorModelId: primaryModel
    })
    setSyncReflector(true)
  }

  const renderModelOptions = (currentValue?: string): React.ReactNode => {
    const hasCurrent = currentValue && modelIds.includes(currentValue)
    return (
      <>
        {!hasCurrent && !currentValue && (
          <option value="" disabled>
            -- 请选择模型 --
          </option>
        )}
        {currentValue && !modelIds.includes(currentValue) && (
          <option key={currentValue} value={currentValue}>
            {currentValue} (当前)
          </option>
        )}
        {modelIds.map((modelId) => (
          <option key={modelId} value={modelId}>
            {modelId}
          </option>
        ))}
      </>
    )
  }

  return (
    <SettingsPageLayout label="记忆设置">
      {loadError && (
        <div className="settings-security-note" role="alert">
          <CircleAlert size={15} aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}

      {isMissingGoogleKeyWarning && modelIds.length > 0 && (
        <div
          className="settings-security-note"
          role="alert"
          style={{ background: '#fcf6e8', color: '#825c12', borderColor: '#ecd5a1' }}
        >
          <CircleAlert size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, lineHeight: 1.4 }}>
            <div>
              <strong>未配置 Google 凭据：</strong>系统当前回退到默认的 Gemini
              模型，在对话触发观察时可能报错。建议切换为已配置的可用模型。
            </div>
            <button
              type="button"
              className="settings-secondary-button"
              style={{
                marginTop: 6,
                height: 24,
                fontSize: 11,
                padding: '0 8px',
                cursor: 'pointer'
              }}
              onClick={handleApplyRecommended}
              disabled={saving}
            >
              <Sparkles size={12} aria-hidden="true" />
              一键应用首选模型「{modelIds[0]}」
            </button>
          </div>
        </div>
      )}

      {saveFeedback && (
        <div
          className="settings-connector-status"
          role="status"
          style={{ background: '#eaf5eb', color: '#276738' }}
        >
          <Check size={14} aria-hidden="true" />
          <span>{saveFeedback}</span>
        </div>
      )}

      <SettingsSection
        title="观察记忆"
        description="Mastra Observational Memory 在后台把冗长的历史对话压缩为观察日志，保持长会话上下文可控。修改立即生效，新会话自动继承。"
      >
        <SettingsRow
          title="观察者模型"
          description="负责把原始消息历史压缩成观察日志；推荐长上下文且响应快的模型。"
        >
          <SettingsSelect
            label="观察者模型"
            value={status.observerModelId ?? ''}
            disabled={saving}
            onChange={(event) => handleObserverChange(event.currentTarget.value)}
          >
            {renderModelOptions(status.observerModelId)}
          </SettingsSelect>
        </SettingsRow>

        <SettingsRow
          title="同步反思模型"
          description="反思者模型默认与观察者模型保持一致，避免反思压缩时回退到默认未授权模型。"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Toggle
              label="反思者模型跟随观察者模型"
              checked={syncReflector}
              disabled={saving}
              onChange={(checked) => {
                setSyncReflector(checked)
                if (
                  checked &&
                  status.observerModelId &&
                  status.reflectorModelId !== status.observerModelId
                ) {
                  void update({ reflectorModelId: status.observerModelId })
                }
              }}
            />
            <label
              htmlFor={syncToggleId}
              style={{ fontSize: 12, color: 'var(--text-secondary, #777)', cursor: 'pointer' }}
            >
              保持一致
            </label>
          </div>
        </SettingsRow>

        {!syncReflector && (
          <SettingsRow
            title="反思者模型"
            description="观察日志过长时由它整体重写压缩；可与观察者使用不同模型。"
          >
            <SettingsSelect
              label="反思者模型"
              value={status.reflectorModelId ?? ''}
              disabled={saving}
              onChange={(event) => void update({ reflectorModelId: event.currentTarget.value })}
            >
              {renderModelOptions(status.reflectorModelId)}
            </SettingsSelect>
          </SettingsRow>
        )}
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
          onClick={() => {
            const defaultModel =
              modelIds.length > 0 && !hasGoogleKey ? modelIds[0] : OM_DEFAULTS.observerModelId
            void update({
              observerModelId: defaultModel,
              reflectorModelId: defaultModel,
              observationThreshold: OM_DEFAULTS.observationThreshold,
              reflectionThreshold: OM_DEFAULTS.reflectionThreshold,
              cavemanObservations: OM_DEFAULTS.cavemanObservations,
              observeAttachments: OM_DEFAULTS.observeAttachments,
              scope: OM_DEFAULTS.omScope
            })
          }}
        >
          <RotateCcw size={14} aria-hidden="true" />
          恢复默认参数
        </button>
      </SettingsPageActions>
    </SettingsPageLayout>
  )
}
