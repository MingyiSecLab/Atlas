import type {
  RuntimeCustomProviderInfo,
  RuntimeCustomProviderProtocol,
  RuntimeProviderInfo
} from '@mingyi/runtime'
import {
  ExternalLink,
  Eye,
  EyeOff,
  LoaderCircle,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Server,
  Settings2,
  Trash2,
  Wifi,
  WifiOff,
  X
} from 'lucide-react'
import { ModelBrandIcon, ProviderBrandIcon } from '../../../../common/ModelBrandIcon'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProviderOAuthEvent } from '../../../../../../../shared/provider-ipc'
import { SettingsPageLayout, SettingsSection } from '../../components/settings-controls'

interface OAuthPromptState {
  provider: string
  requestId: string
  message: string
  placeholder?: string
  allowEmpty: boolean
}

interface AddDialogState {
  mode: 'catalog' | 'custom'
  editing?: RuntimeCustomProviderInfo
}

function sourceLabel(source: RuntimeProviderInfo['source']): string {
  switch (source) {
    case 'oauth':
      return 'OAuth 已连接'
    case 'stored':
      return 'API Key 已保存'
    case 'env':
      return '环境变量'
    case 'none':
      return '未配置'
  }
}

function providerError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const ProviderSettingsPage: React.FC = () => {
  const [providers, setProviders] = useState<RuntimeProviderInfo[]>([])
  const [customProviders, setCustomProviders] = useState<RuntimeCustomProviderInfo[]>([])
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<'all' | 'standard' | 'custom'>('all')
  const [busyProvider, setBusyProvider] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<AddDialogState | null>(null)
  const [managedProviderId, setManagedProviderId] = useState<string | null>(null)
  const [oauthMessage, setOAuthMessage] = useState<string | null>(null)
  const [oauthUrl, setOAuthUrl] = useState<string | null>(null)
  const [oauthPrompt, setOAuthPrompt] = useState<OAuthPromptState | null>(null)
  const [oauthPromptValue, setOAuthPromptValue] = useState('')
  const activeOAuthProvider = useRef<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const [nextProviders, nextCustomProviders] = await Promise.all([
        window.api.providers.list(),
        window.api.providers.listCustom()
      ])
      setProviders(nextProviders)
      setCustomProviders(nextCustomProviders)
      setError(null)
    } catch (refreshError) {
      setError(providerError(refreshError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.api.providers.onOAuthEvent((event: ProviderOAuthEvent) => {
      if (event.type === 'auth') {
        setOAuthMessage(event.instructions ?? '已在浏览器中打开授权页面。')
        setOAuthUrl(event.url)
      } else if (event.type === 'prompt') {
        setOAuthPrompt({
          provider: event.provider,
          requestId: event.requestId,
          message: event.message,
          placeholder: event.placeholder,
          allowEmpty: event.allowEmpty === true
        })
        setOAuthPromptValue('')
      } else if (event.type === 'progress') {
        setOAuthMessage(event.message)
      } else if (event.type === 'complete') {
        activeOAuthProvider.current = null
        setOAuthPrompt(null)
        setOAuthUrl(null)
        setOAuthMessage('OAuth 连接成功。')
        void refresh()
      } else {
        activeOAuthProvider.current = null
        setOAuthPrompt(null)
        setOAuthMessage(null)
        setError(event.message)
      }
    })
    queueMicrotask(() => void refresh())

    return () => {
      unsubscribe()
      const provider = activeOAuthProvider.current
      if (provider) void window.api.providers.cancelOAuth(provider)
    }
  }, [refresh])

  const configuredProviders = useMemo(
    () => providers.filter((provider) => provider.source !== 'none'),
    [providers]
  )
  const availableProviders = useMemo(
    () => providers.filter((provider) => provider.source === 'none'),
    [providers]
  )
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredProviders = configuredProviders.filter(
    (provider) =>
      !normalizedQuery ||
      provider.name.toLocaleLowerCase().includes(normalizedQuery) ||
      provider.provider.toLocaleLowerCase().includes(normalizedQuery)
  )
  const filteredCustomProviders = customProviders.filter(
    (provider) =>
      !normalizedQuery ||
      provider.name.toLocaleLowerCase().includes(normalizedQuery) ||
      provider.id.toLocaleLowerCase().includes(normalizedQuery) ||
      provider.models.some((model) => model.toLocaleLowerCase().includes(normalizedQuery))
  )
  const configuredCount = configuredProviders.length + customProviders.length
  const filteredCount = filteredProviders.length + filteredCustomProviders.length
  const managedProvider = providers.find((provider) => provider.provider === managedProviderId)

  const runProviderAction = async (
    provider: string,
    action: () => Promise<void>
  ): Promise<void> => {
    setBusyProvider(provider)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (actionError) {
      setError(providerError(actionError))
      throw actionError
    } finally {
      setBusyProvider(null)
    }
  }

  const startOAuth = (provider: RuntimeProviderInfo, authMode?: string): void => {
    const providerId = provider.provider
    const selectedAuthMode = authMode ?? provider.oauth?.authModes[0]?.id
    activeOAuthProvider.current = providerId
    setOAuthMessage('正在启动 OAuth 登录...')
    setOAuthUrl(null)
    setDialog(null)
    setManagedProviderId(null)
    void runProviderAction(providerId, () =>
      window.api.providers.loginOAuth({
        provider: providerId,
        ...(selectedAuthMode ? { authMode: selectedAuthMode } : {})
      })
    )
      .catch(() => undefined)
      .finally(() => {
        activeOAuthProvider.current = null
      })
  }

  const submitOAuthPrompt = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!oauthPrompt || (!oauthPrompt.allowEmpty && !oauthPromptValue.trim())) return
    const response = { requestId: oauthPrompt.requestId, value: oauthPromptValue }
    setOAuthPrompt(null)
    setOAuthPromptValue('')
    void window.api.providers.respondOAuthPrompt(response).catch((promptError) => {
      setError(providerError(promptError))
    })
  }

  const cancelOAuth = (): void => {
    const provider = activeOAuthProvider.current ?? oauthPrompt?.provider
    if (provider) void window.api.providers.cancelOAuth(provider)
    activeOAuthProvider.current = null
    setOAuthPrompt(null)
    setOAuthUrl(null)
    setOAuthMessage(null)
    setBusyProvider(null)
  }

  const showStandard = activeCategory === 'all' || activeCategory === 'standard'
  const showCustom = activeCategory === 'all' || activeCategory === 'custom'
  const visibleCount =
    (showStandard ? filteredProviders.length : 0) +
    (showCustom ? filteredCustomProviders.length : 0)

  return (
    <SettingsPageLayout label="模型服务设置">
      <SettingsSection title="已配置服务" description={`共 ${configuredCount} 个连接`}>
        <div className="settings-provider-toolbar">
          <div className="settings-provider-search">
            <Search size={14} className="settings-provider-search-icon" aria-hidden="true" />
            <input
              type="search"
              aria-label="搜索已配置的模型服务"
              placeholder="搜索已配置服务名称、标识或模型..."
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            {query ? (
              <button
                type="button"
                className="settings-provider-search-clear"
                aria-label="清空搜索"
                onClick={() => setQuery('')}
              >
                <X size={12} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="settings-provider-toolbar-actions">
            <button
              className="settings-icon-button"
              type="button"
              title="刷新模型服务"
              aria-label="刷新模型服务"
              disabled={loading}
              onClick={() => void refresh()}
            >
              <RefreshCw
                size={14}
                className={loading ? 'settings-provider-spinner' : ''}
                aria-hidden="true"
              />
            </button>
            <button
              className="settings-primary-button settings-provider-add-button"
              type="button"
              onClick={() => setDialog({ mode: 'catalog' })}
            >
              <Plus size={14} aria-hidden="true" />
              <span>添加</span>
            </button>
          </div>
        </div>

        {configuredCount > 0 ? (
          <div className="settings-provider-filter-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === 'all'}
              className={`settings-provider-tab-pill ${activeCategory === 'all' ? 'is-active' : ''}`}
              onClick={() => setActiveCategory('all')}
            >
              全部 ({filteredCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === 'standard'}
              className={`settings-provider-tab-pill ${activeCategory === 'standard' ? 'is-active' : ''}`}
              onClick={() => setActiveCategory('standard')}
            >
              标准服务 ({filteredProviders.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === 'custom'}
              className={`settings-provider-tab-pill ${activeCategory === 'custom' ? 'is-active' : ''}`}
              onClick={() => setActiveCategory('custom')}
            >
              自定义端点 ({filteredCustomProviders.length})
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="settings-provider-notice is-error" role="alert">
            <span>{error}</span>
            <button type="button" aria-label="关闭错误" onClick={() => setError(null)}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {oauthMessage || oauthPrompt ? (
          <div className="settings-oauth-panel" aria-live="polite">
            <div className="settings-oauth-heading">
              <LoaderCircle size={14} className="settings-provider-spinner" aria-hidden="true" />
              <span>{oauthPrompt?.message ?? oauthMessage}</span>
              <button type="button" aria-label="取消 OAuth 登录" onClick={cancelOAuth}>
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            {oauthUrl ? (
              <a href={oauthUrl} target="_blank" rel="noreferrer">
                打开授权页面 <ExternalLink size={12} aria-hidden="true" />
              </a>
            ) : null}
            {oauthPrompt ? (
              <form className="settings-oauth-prompt" onSubmit={submitOAuthPrompt}>
                <input
                  autoFocus
                  aria-label="OAuth 验证码"
                  placeholder={oauthPrompt.placeholder ?? '输入验证码'}
                  value={oauthPromptValue}
                  onChange={(event) => setOAuthPromptValue(event.currentTarget.value)}
                />
                <button
                  className="settings-primary-button"
                  type="submit"
                  disabled={!oauthPrompt.allowEmpty && !oauthPromptValue.trim()}
                >
                  提交
                </button>
              </form>
            ) : null}
          </div>
        ) : null}

        <div className="settings-provider-list" aria-busy={loading}>
          {loading && configuredCount === 0 ? (
            <div className="settings-provider-empty">
              <LoaderCircle size={18} className="settings-provider-spinner" aria-hidden="true" />
              <span>正在加载模型服务...</span>
            </div>
          ) : null}
          {!loading && configuredCount === 0 ? (
            <div className="settings-provider-empty is-unconfigured">
              <div className="settings-provider-empty-icon">
                <Server size={22} aria-hidden="true" />
              </div>
              <span className="settings-provider-empty-title">尚未配置模型服务</span>
              <p className="settings-provider-empty-desc">
                配置 OpenAI、Claude、Gemini、DeepSeek、智谱 GLM 或本地 Ollama 服务以开始使用
              </p>
              <button type="button" onClick={() => setDialog({ mode: 'catalog' })}>
                <Plus size={13} aria-hidden="true" />
                <span>添加第一个服务</span>
              </button>
            </div>
          ) : null}
          {!loading && configuredCount > 0 && visibleCount === 0 ? (
            <div className="settings-provider-empty">没有匹配的已配置服务</div>
          ) : null}

          {showStandard &&
            filteredProviders.map((provider) => {
              const isBusy = busyProvider === provider.provider
              return (
                <section className="settings-provider-row is-standard" key={provider.provider}>
                  <div className="settings-provider-brand-badge">
                    <ProviderBrandIcon providerId={provider.provider} size={32} />
                  </div>

                  <div className="settings-provider-identity">
                    <div className="settings-provider-title-row">
                      <strong>{provider.name}</strong>
                      <code>{provider.provider}</code>
                    </div>
                    {provider.envVars.length > 0 && (
                      <span className="settings-provider-env-hint">
                        环境变量: {provider.envVars[0]}
                      </span>
                    )}
                  </div>

                  <span className={`settings-provider-source is-${provider.source}`}>
                    <span className="settings-provider-source-dot" />
                    <span>{sourceLabel(provider.source)}</span>
                  </span>

                  <div className="settings-provider-actions">
                    {provider.docUrl ? (
                      <a
                        href={provider.docUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="settings-provider-link"
                        title="查看文档"
                      >
                        <span>获取 Key</span>
                        <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="settings-provider-btn"
                      disabled={isBusy}
                      aria-label={`管理模型服务：${provider.name}`}
                      onClick={() => setManagedProviderId(provider.provider)}
                    >
                      <Settings2 size={13} aria-hidden="true" />
                      <span>管理</span>
                    </button>
                  </div>
                </section>
              )
            })}

          {showCustom &&
            filteredCustomProviders.map((provider) => {
              const actionId = `custom:${provider.id}`
              const isBusy = busyProvider === actionId
              return (
                <section className="settings-provider-row is-custom" key={actionId}>
                  <div className="settings-provider-identity">
                    <div className="settings-provider-title-row">
                      <strong>{provider.name}</strong>
                      <code>{provider.id}</code>
                    </div>
                    <div className="settings-custom-provider-detail" title={provider.url}>
                      {provider.protocol !== 'openai-chat' ? (
                        <code>
                          {provider.protocol === 'openai-responses'
                            ? 'OpenAI Responses'
                            : 'Anthropic Messages'}
                        </code>
                      ) : null}
                      <div className="settings-custom-model-chips">
                        {provider.models.map((model) => (
                          <span key={model} className="settings-custom-model-chip" title={model}>
                            <ModelBrandIcon model={model} size={11} />
                            <code>{model}</code>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <span className="settings-provider-source is-stored">
                    <span className="settings-provider-source-dot" />
                    <span>自定义 · {provider.models.length} 个模型</span>
                  </span>

                  <div className="settings-provider-actions">
                    <button
                      type="button"
                      className="settings-provider-btn"
                      disabled={isBusy}
                      aria-label={`编辑自定义模型：${provider.name}`}
                      onClick={() => setDialog({ mode: 'custom', editing: provider })}
                    >
                      <Pencil size={13} aria-hidden="true" />
                      <span>编辑</span>
                    </button>
                    <button
                      type="button"
                      className="settings-provider-btn is-danger"
                      disabled={isBusy}
                      aria-label={`删除自定义模型：${provider.name}`}
                      onClick={() =>
                        void runProviderAction(actionId, () =>
                          window.api.providers.removeCustom(provider.id)
                        ).catch(() => undefined)
                      }
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      <span>删除</span>
                    </button>
                  </div>
                </section>
              )
            })}
        </div>

        {dialog ? (
          <ProviderAddDialog
            key={`${dialog.mode}:${dialog.editing?.id ?? 'new'}`}
            initialMode={dialog.mode}
            editing={dialog.editing}
            providers={availableProviders}
            busy={busyProvider !== null}
            onClose={() => setDialog(null)}
            onSaveProvider={async (provider, key) => {
              await runProviderAction(provider.provider, () =>
                window.api.providers.setApiKey({ provider: provider.provider, key })
              )
              setDialog(null)
            }}
            onOAuth={startOAuth}
            onSaveCustom={async (input) => {
              await runProviderAction(`custom:${input.previousId ?? input.name}`, async () => {
                await window.api.providers.upsertCustom(input)
              })
              setDialog(null)
            }}
          />
        ) : null}

        {managedProvider ? (
          <ProviderManageDialog
            key={managedProvider.provider}
            provider={managedProvider}
            busy={busyProvider === managedProvider.provider}
            onClose={() => setManagedProviderId(null)}
            onSaveApiKey={async (key) => {
              await runProviderAction(managedProvider.provider, () =>
                window.api.providers.setApiKey({ provider: managedProvider.provider, key })
              )
              setManagedProviderId(null)
            }}
            onRemoveApiKey={async () => {
              await runProviderAction(managedProvider.provider, () =>
                window.api.providers.removeApiKey(managedProvider.provider)
              )
              setManagedProviderId(null)
            }}
            onOAuth={(authMode) => startOAuth(managedProvider, authMode)}
            onLogoutOAuth={async () => {
              await runProviderAction(managedProvider.provider, () =>
                window.api.providers.logoutOAuth(managedProvider.provider)
              )
              setManagedProviderId(null)
            }}
          />
        ) : null}
      </SettingsSection>
    </SettingsPageLayout>
  )
}

interface ProviderManageDialogProps {
  provider: RuntimeProviderInfo
  busy: boolean
  onClose: () => void
  onSaveApiKey: (key: string) => Promise<void>
  onRemoveApiKey: () => Promise<void>
  onOAuth: (authMode?: string) => void
  onLogoutOAuth: () => Promise<void>
}

const ProviderManageDialog: React.FC<ProviderManageDialogProps> = ({
  provider,
  busy,
  onClose,
  onSaveApiKey,
  onRemoveApiKey,
  onOAuth,
  onLogoutOAuth
}) => {
  const [apiKey, setApiKey] = useState('')
  const [keyVisible, setKeyVisible] = useState(false)
  const [authMode, setAuthMode] = useState(provider.oauth?.authModes[0]?.id ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  const runDialogAction = async (action: () => Promise<void>): Promise<void> => {
    setFormError(null)
    try {
      await action()
    } catch (actionError) {
      setFormError(providerError(actionError))
    }
  }

  return (
    <div
      className="settings-provider-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="settings-provider-modal settings-provider-manage-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`管理模型服务：${provider.name}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
        }}
      >
        <header>
          <div className="settings-provider-modal-title-wrap">
            <div className="settings-provider-modal-avatar">
              <ProviderBrandIcon providerId={provider.provider} size={32} />
            </div>
            <div>
              <h3>{provider.name}</h3>
              <p>
                标准模型服务 · <code>{provider.provider}</code>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="settings-icon-button"
            aria-label="关闭模型服务管理"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="settings-provider-manage-body">
          <div className="settings-provider-current-status">
            <span>当前连接状态</span>
            <strong className={`settings-provider-source is-${provider.source}`}>
              <span className="settings-provider-source-dot" />
              <span>{sourceLabel(provider.source)}</span>
            </strong>
          </div>

          <form
            className="settings-provider-manage-section"
            onSubmit={(event) => {
              event.preventDefault()
              const key = apiKey.trim()
              if (key) void runDialogAction(() => onSaveApiKey(key))
            }}
          >
            <div className="settings-provider-manage-heading">
              <div>
                <h4>API Key 凭据</h4>
                <p>
                  {provider.hasStoredApiKey
                    ? '输入新的 Key 以替换本机保存的凭据。'
                    : provider.source === 'env'
                      ? '当前由环境变量提供，也可以保存新的本机凭据。'
                      : '保存用于此供应商的本机凭据。'}
                </p>
              </div>
              {provider.docUrl ? (
                <a
                  href={provider.docUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="settings-provider-link"
                >
                  <span>获取 Key</span>
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              ) : null}
            </div>
            <div className="settings-secret-input">
              <input
                autoFocus
                type={keyVisible ? 'text' : 'password'}
                autoComplete="off"
                aria-label={`${provider.name} API Key`}
                placeholder={provider.hasStoredApiKey ? '输入新的 Key 以替换' : '输入 API Key'}
                value={apiKey}
                disabled={busy}
                onChange={(event) => setApiKey(event.currentTarget.value)}
              />
              <button
                type="button"
                title={keyVisible ? '隐藏 API Key' : '显示 API Key'}
                aria-label={keyVisible ? '隐藏 API Key' : '显示 API Key'}
                onClick={() => setKeyVisible((current) => !current)}
              >
                {keyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                type="submit"
                className="settings-secret-save-btn"
                title="保存 API Key"
                aria-label="保存 API Key"
                disabled={busy || !apiKey.trim()}
              >
                {busy ? (
                  <LoaderCircle className="settings-provider-spinner" size={14} />
                ) : (
                  <Save size={14} />
                )}
              </button>
            </div>
            {provider.hasStoredApiKey ? (
              <button
                className="settings-provider-danger-action"
                type="button"
                disabled={busy}
                onClick={() => void runDialogAction(onRemoveApiKey)}
              >
                <Trash2 size={13} aria-hidden="true" />
                <span>删除已保存的 Key</span>
              </button>
            ) : null}
          </form>

          {provider.oauth ? (
            <div className="settings-provider-manage-section">
              <div className="settings-provider-manage-heading">
                <div>
                  <h4>OAuth 浏览器授权</h4>
                  <p>
                    {provider.isOAuthAuthenticated
                      ? '已通过浏览器完成授权登录。'
                      : '通过官方浏览器弹窗完成免 Key 授权登录。'}
                  </p>
                </div>
              </div>
              {!provider.isOAuthAuthenticated && provider.oauth.authModes.length > 1 ? (
                <label className="settings-provider-modal-field">
                  <span>登录方式</span>
                  <select
                    aria-label={`${provider.name} OAuth 登录方式`}
                    value={authMode}
                    disabled={busy}
                    onChange={(event) => setAuthMode(event.currentTarget.value)}
                  >
                    {provider.oauth.authModes.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                className="settings-secondary-button settings-provider-oauth-action"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (provider.isOAuthAuthenticated) {
                    void runDialogAction(onLogoutOAuth)
                  } else {
                    onOAuth(authMode || undefined)
                  }
                }}
              >
                {provider.isOAuthAuthenticated ? (
                  <>
                    <LogOut size={13} aria-hidden="true" />
                    <span>退出 OAuth</span>
                  </>
                ) : (
                  <>
                    <LogIn size={13} aria-hidden="true" />
                    <span>OAuth 登录</span>
                  </>
                )}
              </button>
            </div>
          ) : null}

          {formError ? (
            <div className="settings-provider-modal-error" role="alert">
              {formError}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

interface ProviderAddDialogProps {
  initialMode: 'catalog' | 'custom'
  editing?: RuntimeCustomProviderInfo
  providers: RuntimeProviderInfo[]
  busy: boolean
  onClose: () => void
  onSaveProvider: (provider: RuntimeProviderInfo, key: string) => Promise<void>
  onOAuth: (provider: RuntimeProviderInfo, authMode?: string) => void
  onSaveCustom: (input: {
    previousId?: string
    name: string
    url: string
    apiKey?: string
    models: string[]
    protocol?: RuntimeCustomProviderProtocol
  }) => Promise<void>
}

const ProviderAddDialog: React.FC<ProviderAddDialogProps> = ({
  initialMode,
  editing,
  providers,
  busy,
  onClose,
  onSaveProvider,
  onOAuth,
  onSaveCustom
}) => {
  const [mode, setMode] = useState(initialMode)
  const [providerId, setProviderId] = useState(providers[0]?.provider ?? '')
  const [credentialMode, setCredentialMode] = useState<'key' | 'oauth'>('key')
  const [apiKey, setApiKey] = useState('')
  const [authMode, setAuthMode] = useState(providers[0]?.oauth?.authModes[0]?.id ?? '')
  const [name, setName] = useState(editing?.name ?? '')
  const [url, setUrl] = useState(editing?.url ?? '')
  const [models, setModels] = useState(editing?.models.join('\n') ?? '')
  const [protocol, setProtocol] = useState<RuntimeCustomProviderProtocol>(
    editing?.protocol ?? 'openai-chat'
  )
  const [formError, setFormError] = useState<string | null>(null)

  // 测试连通性
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    latencyMs?: number
    error?: string
  } | null>(null)

  const selectedProvider = providers.find((provider) => provider.provider === providerId)

  const handleTestModel = async (): Promise<void> => {
    const trimUrl = url.trim()
    if (!trimUrl) {
      setTestResult({ ok: false, error: '请先填写 Base URL。' })
      return
    }
    const firstModel = models
      .split(/[\n,]/)
      .map((m) => m.trim())
      .filter(Boolean)[0]
    if (!firstModel) {
      setTestResult({ ok: false, error: '请先填写至少一个模型 ID。' })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.api.providers.testCustomModel({
        url: trimUrl,
        apiKey: apiKey.trim() || undefined,
        model: firstModel,
        protocol
      })
      setTestResult({ ok: true, latencyMs: result.latencyMs })
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setTesting(false)
    }
  }

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setFormError(null)
    try {
      if (mode === 'catalog') {
        if (!selectedProvider) throw new Error('请选择模型供应商。')
        if (credentialMode === 'oauth') {
          onOAuth(selectedProvider, authMode || undefined)
          return
        }
        if (!apiKey.trim()) throw new Error('请输入 API Key。')
        await onSaveProvider(selectedProvider, apiKey.trim())
        return
      }
      const modelIds = models
        .split(/[\n,]/)
        .map((model) => model.trim())
        .filter(Boolean)
      await onSaveCustom({
        ...(editing ? { previousId: editing.id } : {}),
        name: name.trim(),
        url: url.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        models: modelIds,
        protocol
      })
    } catch (submitError) {
      setFormError(providerError(submitError))
    }
  }

  return (
    <div
      className="settings-provider-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="settings-provider-modal"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? '编辑自定义模型' : '添加模型服务'}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
        }}
      >
        <header>
          <div className="settings-provider-modal-title-wrap">
            <div>
              <h3>{editing ? '编辑自定义模型' : '添加模型服务'}</h3>
              <p>
                {editing ? '更新端点和可用模型。' : '连接标准供应商或 OpenAI-compatible 端点。'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="settings-icon-button"
            aria-label="关闭添加模型服务"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        {!editing ? (
          <div className="settings-provider-segmented-wrap">
            <div className="settings-provider-segmented" aria-label="模型服务类型">
              <button
                type="button"
                className={mode === 'catalog' ? 'is-active' : ''}
                aria-pressed={mode === 'catalog'}
                onClick={() => setMode('catalog')}
              >
                标准供应商
              </button>
              <button
                type="button"
                className={mode === 'custom' ? 'is-active' : ''}
                aria-pressed={mode === 'custom'}
                onClick={() => setMode('custom')}
              >
                自定义模型
              </button>
            </div>
          </div>
        ) : null}

        <form onSubmit={(event) => void submit(event)}>
          <div className="settings-provider-modal-body">
            {mode === 'catalog' ? (
              providers.length > 0 ? (
                <>
                  <label className="settings-provider-modal-field">
                    <span>模型供应商</span>
                    <select
                      aria-label="选择模型供应商"
                      value={providerId}
                      onChange={(event) => {
                        const nextProviderId = event.currentTarget.value
                        const nextProvider = providers.find(
                          (provider) => provider.provider === nextProviderId
                        )
                        setProviderId(nextProviderId)
                        setCredentialMode((current) => (nextProvider?.oauth ? current : 'key'))
                        setAuthMode(nextProvider?.oauth?.authModes[0]?.id ?? '')
                      }}
                    >
                      {providers.map((provider) => (
                        <option key={provider.provider} value={provider.provider}>
                          {provider.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedProvider?.oauth ? (
                    <div className="settings-provider-auth-method">
                      <span>连接方式</span>
                      <div className="settings-provider-segmented is-compact">
                        <button
                          type="button"
                          className={credentialMode === 'key' ? 'is-active' : ''}
                          aria-pressed={credentialMode === 'key'}
                          onClick={() => setCredentialMode('key')}
                        >
                          API Key
                        </button>
                        <button
                          type="button"
                          className={credentialMode === 'oauth' ? 'is-active' : ''}
                          aria-pressed={credentialMode === 'oauth'}
                          onClick={() => setCredentialMode('oauth')}
                        >
                          OAuth
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {credentialMode === 'key' ? (
                    <label className="settings-provider-modal-field">
                      <span>API Key</span>
                      <input
                        autoFocus
                        type="password"
                        autoComplete="off"
                        aria-label="新供应商 API Key"
                        placeholder="输入 API Key"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.currentTarget.value)}
                      />
                    </label>
                  ) : selectedProvider?.oauth && selectedProvider.oauth.authModes.length > 1 ? (
                    <label className="settings-provider-modal-field">
                      <span>OAuth 登录方式</span>
                      <select
                        aria-label="新供应商 OAuth 登录方式"
                        value={authMode || selectedProvider.oauth.authModes[0]?.id}
                        onChange={(event) => setAuthMode(event.currentTarget.value)}
                      >
                        {selectedProvider.oauth.authModes.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </>
              ) : (
                <div className="settings-provider-modal-empty">所有标准供应商都已配置。</div>
              )
            ) : (
              <>
                <label className="settings-provider-modal-field">
                  <span>供应商名称</span>
                  <input
                    autoFocus
                    aria-label="自定义供应商名称"
                    placeholder="例如：本地 Ollama"
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                  />
                </label>
                <label className="settings-provider-modal-field">
                  <span>Base URL</span>
                  <input
                    type="url"
                    aria-label="自定义供应商 Base URL"
                    placeholder="http://127.0.0.1:11434/v1"
                    value={url}
                    onChange={(event) => {
                      setUrl(event.currentTarget.value)
                      setTestResult(null)
                    }}
                  />
                </label>

                <label className="settings-provider-modal-field">
                  <span>接口协议</span>
                  <select
                    aria-label="自定义供应商接口协议"
                    value={protocol}
                    onChange={(event) =>
                      setProtocol(event.currentTarget.value as RuntimeCustomProviderProtocol)
                    }
                  >
                    <option value="openai-chat">OpenAI Chat Completions（默认）</option>
                    <option value="openai-responses">OpenAI Responses</option>
                    <option value="anthropic">Anthropic Messages</option>
                  </select>
                </label>
                <label className="settings-provider-modal-field">
                  <span>模型 ID</span>
                  <textarea
                    aria-label="自定义模型 ID"
                    placeholder={'每行一个模型，例如：\nqwen3-coder\ndeepseek-r1'}
                    value={models}
                    onChange={(event) => setModels(event.currentTarget.value)}
                  />
                </label>
                <label className="settings-provider-modal-field">
                  <span>API Key {editing?.hasApiKey ? '（留空保留已有 Key）' : '（可选）'}</span>
                  <input
                    type="password"
                    autoComplete="off"
                    aria-label="自定义供应商 API Key"
                    placeholder={editing?.hasApiKey ? '已有 Key，不修改请留空' : '无需认证时留空'}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.currentTarget.value)}
                  />
                </label>

                <div className="settings-provider-test-row">
                  <button
                    type="button"
                    className="settings-test-btn"
                    disabled={testing || !url.trim()}
                    onClick={() => void handleTestModel()}
                    aria-label="测试端点连通性"
                  >
                    {testing ? (
                      <LoaderCircle
                        size={13}
                        className="settings-provider-spinner"
                        aria-hidden="true"
                      />
                    ) : (
                      <Wifi size={13} aria-hidden="true" />
                    )}
                    <span>{testing ? '测试中...' : '测试连通性'}</span>
                  </button>
                  {testResult !== null ? (
                    <span className={`settings-test-result ${testResult.ok ? 'is-ok' : 'is-fail'}`}>
                      {testResult.ok ? (
                        <>
                          <Wifi size={12} aria-hidden="true" /> 连接成功 · {testResult.latencyMs}ms
                        </>
                      ) : (
                        <>
                          <WifiOff size={12} aria-hidden="true" /> {testResult.error}
                        </>
                      )}
                    </span>
                  ) : null}
                </div>
              </>
            )}

            {formError ? (
              <div className="settings-provider-modal-error" role="alert">
                {formError}
              </div>
            ) : null}
          </div>

          <footer className="settings-provider-modal-footer">
            <button className="settings-secondary-button" type="button" onClick={onClose}>
              取消
            </button>
            {(mode === 'custom' || providers.length > 0) && (
              <button className="settings-primary-button" type="submit" disabled={busy}>
                {busy ? <LoaderCircle className="settings-provider-spinner" size={13} /> : null}
                <span>
                  {editing ? '保存修改' : credentialMode === 'oauth' ? '开始登录' : '添加服务'}
                </span>
              </button>
            )}
          </footer>
        </form>
      </div>
    </div>
  )
}
