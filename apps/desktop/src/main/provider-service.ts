import type { RuntimeProviderOAuthInfo, UpsertRuntimeCustomProviderInput } from '@mingyi/runtime'
import { BrowserWindow, ipcMain, shell } from 'electron'
import type { WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import {
  PROVIDER_IPC,
  type FetchCustomModelsInput,
  type ProviderOAuthEvent,
  type ProviderOAuthLoginInput,
  type ProviderOAuthPromptResponse,
  type TestCustomModelInput
} from '../shared/provider-ipc'
import type { DesktopRuntimeManager } from './runtime-manager'

interface ActiveLogin {
  owner: WebContents
  controller: AbortController
}

interface PendingPrompt {
  owner: WebContents
  provider: string
  allowEmpty: boolean
  resolve: (value: string) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

const OAUTH_PROMPT_TIMEOUT_MS = 10 * 60 * 1000

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function providerId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || /\s/.test(value.trim())) {
    throw new Error('Provider ID must be a non-empty value without whitespace.')
  }
  return value.trim()
}

const CUSTOM_PROVIDER_PROTOCOLS = ['openai-chat', 'openai-responses', 'anthropic'] as const

function customProviderInput(value: unknown): UpsertRuntimeCustomProviderInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid custom provider request.')
  const input = value as Record<string, unknown>
  if (typeof input.name !== 'string' || typeof input.url !== 'string') {
    throw new Error('Custom provider name and URL must be strings.')
  }
  if (!Array.isArray(input.models) || input.models.some((model) => typeof model !== 'string')) {
    throw new Error('Custom provider models must be a string array.')
  }
  if (input.models.length > 100) throw new Error('Custom provider has too many models.')
  if (input.apiKey !== undefined && typeof input.apiKey !== 'string') {
    throw new Error('Custom provider API key must be a string.')
  }
  if (input.previousId !== undefined && typeof input.previousId !== 'string') {
    throw new Error('Previous custom provider ID must be a string.')
  }
  if (
    input.protocol !== undefined &&
    !(CUSTOM_PROVIDER_PROTOCOLS as readonly string[]).includes(String(input.protocol))
  ) {
    throw new Error('Custom provider protocol must be openai-chat, openai-responses, or anthropic.')
  }
  if (
    input.maxOutputTokens !== undefined &&
    (typeof input.maxOutputTokens !== 'number' ||
      !Number.isFinite(input.maxOutputTokens) ||
      input.maxOutputTokens <= 0)
  ) {
    throw new Error('Custom provider maxOutputTokens must be a positive number.')
  }
  return {
    name: input.name.slice(0, 120),
    url: input.url.slice(0, 2048),
    models: input.models.map((model) => model.slice(0, 300)),
    ...(input.apiKey !== undefined ? { apiKey: input.apiKey.slice(0, 16_384) } : {}),
    ...(input.previousId !== undefined ? { previousId: providerId(input.previousId) } : {}),
    ...(input.protocol !== undefined
      ? { protocol: input.protocol as UpsertRuntimeCustomProviderInput['protocol'] }
      : {}),
    ...(input.maxOutputTokens !== undefined
      ? { maxOutputTokens: Math.floor(input.maxOutputTokens) }
      : {})
  }
}

function oauthLoginInput(value: unknown): ProviderOAuthLoginInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid OAuth login request.')
  const input = value as { provider?: unknown; authMode?: unknown }
  if (input.authMode !== undefined && typeof input.authMode !== 'string') {
    throw new Error('OAuth auth mode must be a string.')
  }
  return {
    provider: providerId(input.provider),
    ...(input.authMode?.trim() ? { authMode: input.authMode.trim() } : {})
  }
}

function loginId(owner: WebContents, provider: string): string {
  return `${owner.id}:${provider}`
}

function openOAuthUrl(url: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      void shell.openExternal(url).catch(() => undefined)
    }
  } catch {
    // The URL remains visible in the OAuth event so the user can inspect it.
  }
}

export function registerProviderService(runtimeManager: DesktopRuntimeManager): () => void {
  const activeLogins = new Map<string, ActiveLogin>()
  const pendingPrompts = new Map<string, PendingPrompt>()

  const send = (owner: WebContents, event: ProviderOAuthEvent): void => {
    if (!owner.isDestroyed()) owner.send(PROVIDER_IPC.oauthEvent, event)
  }

  const broadcastChanged = (): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      const owner = window.webContents
      if (!owner.isDestroyed()) owner.send(PROVIDER_IPC.changed)
    }
  }

  const rejectPrompt = (requestId: string, error: Error): void => {
    const pending = pendingPrompts.get(requestId)
    if (!pending) return
    pendingPrompts.delete(requestId)
    clearTimeout(pending.timeout)
    pending.reject(error)
  }

  const requestPrompt = (
    owner: WebContents,
    provider: string,
    prompt: { message: string; placeholder?: string; allowEmpty?: boolean },
    signal: AbortSignal
  ): Promise<string> => {
    if (signal.aborted) return Promise.reject(new Error('OAuth login cancelled.'))

    return new Promise((resolve, reject) => {
      const requestId = randomUUID()
      const timeout = setTimeout(() => {
        rejectPrompt(requestId, new Error('OAuth prompt timed out.'))
      }, OAUTH_PROMPT_TIMEOUT_MS)
      const pending: PendingPrompt = {
        owner,
        provider,
        allowEmpty: prompt.allowEmpty === true,
        resolve,
        reject,
        timeout
      }
      pendingPrompts.set(requestId, pending)
      signal.addEventListener(
        'abort',
        () => rejectPrompt(requestId, new Error('OAuth login cancelled.')),
        { once: true }
      )
      send(owner, {
        type: 'prompt',
        provider,
        requestId,
        message: prompt.message,
        ...(prompt.placeholder ? { placeholder: prompt.placeholder } : {}),
        ...(prompt.allowEmpty !== undefined ? { allowEmpty: prompt.allowEmpty } : {})
      })
    })
  }

  const abortLogin = (owner: WebContents, provider?: string): void => {
    for (const [id, login] of activeLogins) {
      if (login.owner !== owner || (provider && id !== loginId(owner, provider))) continue
      login.controller.abort()
      activeLogins.delete(id)
    }
  }

  ipcMain.handle(PROVIDER_IPC.list, async () => {
    const runtime = await runtimeManager.getRuntime()
    return runtime.providers.list()
  })

  ipcMain.handle(
    PROVIDER_IPC.setApiKey,
    async (_event, input: { provider?: unknown; key?: unknown }) => {
      if (!input || typeof input.key !== 'string') throw new Error('API key must be a string.')
      const runtime = await runtimeManager.getRuntime()
      await runtime.providers.setApiKey({ provider: providerId(input.provider), key: input.key })
      broadcastChanged()
    }
  )

  ipcMain.handle(PROVIDER_IPC.removeApiKey, async (_event, input: unknown) => {
    const runtime = await runtimeManager.getRuntime()
    await runtime.providers.removeApiKey(providerId(input))
    broadcastChanged()
  })

  ipcMain.handle(PROVIDER_IPC.listCustom, async () => {
    const runtime = await runtimeManager.getRuntime()
    return runtime.providers.listCustom()
  })

  ipcMain.handle(PROVIDER_IPC.upsertCustom, async (_event, input: unknown) => {
    const runtime = await runtimeManager.getRuntime()
    const saved = await runtime.providers.upsertCustom(customProviderInput(input))
    broadcastChanged()
    return saved
  })

  ipcMain.handle(PROVIDER_IPC.removeCustom, async (_event, input: unknown) => {
    const runtime = await runtimeManager.getRuntime()
    await runtime.providers.removeCustom(providerId(input))
    broadcastChanged()
  })

  ipcMain.handle(PROVIDER_IPC.listOAuth, async (): Promise<RuntimeProviderOAuthInfo[]> => {
    const runtime = await runtimeManager.getRuntime()
    return runtime.providers.listOAuth()
  })

  ipcMain.handle(PROVIDER_IPC.loginOAuth, async (event, input: unknown) => {
    const { provider, authMode } = oauthLoginInput(input)
    const id = loginId(event.sender, provider)
    if (activeLogins.has(id)) throw new Error(`OAuth login already in progress: ${provider}`)

    const controller = new AbortController()
    activeLogins.set(id, { owner: event.sender, controller })
    const abortOnDestroyed = (): void => controller.abort()
    event.sender.once('destroyed', abortOnDestroyed)

    try {
      const runtime = await runtimeManager.getRuntime()
      const oauthProvider = runtime.providers
        .listOAuth()
        .find(
          (candidate) =>
            candidate.provider === provider || candidate.credentialProvider === provider
        )
      if (authMode && !oauthProvider?.authModes.some((mode) => mode.id === authMode)) {
        throw new Error(`Unsupported OAuth auth mode for ${provider}: ${authMode}`)
      }
      await runtime.providers.login({
        provider,
        callbacks: {
          signal: controller.signal,
          ...(authMode ? { authMode } : {}),
          onAuth: ({ url, instructions }) => {
            send(event.sender, {
              type: 'auth',
              provider,
              url,
              ...(instructions ? { instructions } : {})
            })
            openOAuthUrl(url)
          },
          onPrompt: (prompt) => requestPrompt(event.sender, provider, prompt, controller.signal),
          onManualCodeInput: () =>
            requestPrompt(
              event.sender,
              provider,
              { message: '输入授权页面返回的验证码。' },
              controller.signal
            ),
          onProgress: (message) => send(event.sender, { type: 'progress', provider, message })
        }
      })
      broadcastChanged()
      send(event.sender, { type: 'complete', provider })
    } catch (error) {
      send(event.sender, { type: 'error', provider, message: errorMessage(error) })
      throw error
    } finally {
      activeLogins.delete(id)
      if (!event.sender.isDestroyed()) event.sender.removeListener('destroyed', abortOnDestroyed)
    }
  })

  ipcMain.handle(PROVIDER_IPC.logoutOAuth, async (_event, input: unknown) => {
    const runtime = await runtimeManager.getRuntime()
    await runtime.providers.logout(providerId(input))
    broadcastChanged()
  })

  ipcMain.handle(PROVIDER_IPC.cancelOAuth, (event, input: unknown) => {
    abortLogin(event.sender, providerId(input))
  })

  ipcMain.handle(
    PROVIDER_IPC.respondOAuthPrompt,
    (event, input: ProviderOAuthPromptResponse): void => {
      if (!input || typeof input.requestId !== 'string' || typeof input.value !== 'string') {
        throw new Error('Invalid OAuth prompt response.')
      }
      const pending = pendingPrompts.get(input.requestId)
      if (!pending || pending.owner !== event.sender)
        throw new Error('OAuth prompt is no longer active.')
      if (!pending.allowEmpty && !input.value.trim())
        throw new Error('OAuth response must not be empty.')

      pendingPrompts.delete(input.requestId)
      clearTimeout(pending.timeout)
      pending.resolve(input.value)
    }
  )

  ipcMain.handle(PROVIDER_IPC.fetchCustomModels, async (_event, input: unknown) => {
    const req = input as FetchCustomModelsInput
    if (!req || typeof req.url !== 'string' || !req.url.trim()) {
      throw new Error('URL is required.')
    }
    const base = req.url.trim().replace(/\/$/, '')
    const isAnthropic = req.protocol === 'anthropic'
    const endpoint = `${base}/models`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (req.apiKey?.trim()) headers['Authorization'] = `Bearer ${req.apiKey.trim()}`
    if (isAnthropic) {
      headers['anthropic-version'] = '2023-06-01'
      if (req.apiKey?.trim()) {
        headers['x-api-key'] = req.apiKey.trim()
        delete headers['Authorization']
      }
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const res = await fetch(endpoint, { headers, signal: controller.signal })
      if (!res.ok) {
        if (res.status === 404 || res.status === 405) {
          throw new Error('该端点不支持模型列表接口（/models），请手动输入模型 ID。')
        }
        let detail = res.statusText
        try {
          const err = (await res.json()) as { error?: { message?: string }; message?: string }
          detail = err?.error?.message ?? err?.message ?? detail
        } catch {
          /* ignore */
        }
        throw new Error(`HTTP ${res.status}: ${detail}`)
      }
      const json = (await res.json()) as Record<string, unknown>
      // OpenAI format: { data: [{ id }] }  /  Anthropic format: { data: [{ id }] } or { models: [{ id }] }
      const items =
        (Array.isArray(json.data) ? json.data : null) ??
        (Array.isArray(json.models) ? json.models : null) ??
        []
      const result = (items as Array<{ id?: string; model_id?: string; name?: string }>)
        .map((m) => (m.id ?? m.model_id ?? m.name ?? '').toString())
        .filter(Boolean)
        .sort()
      if (result.length === 0) {
        throw new Error('端点返回了空的模型列表，请手动输入模型 ID。')
      }
      return result
    } finally {
      clearTimeout(timeout)
    }
  })

  ipcMain.handle(PROVIDER_IPC.testCustomModel, async (_event, input: unknown) => {
    const req = input as TestCustomModelInput
    if (!req || typeof req.url !== 'string' || !req.url.trim()) {
      throw new Error('URL is required.')
    }
    if (typeof req.model !== 'string' || !req.model.trim()) {
      throw new Error('Model ID is required.')
    }
    const base = req.url.trim().replace(/\/$/, '')
    const isAnthropic = req.protocol === 'anthropic'
    const endpoint = isAnthropic ? `${base}/messages` : `${base}/chat/completions`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (req.apiKey?.trim()) headers['Authorization'] = `Bearer ${req.apiKey.trim()}`
    if (isAnthropic) {
      headers['anthropic-version'] = '2023-06-01'
      if (req.apiKey?.trim()) {
        headers['x-api-key'] = req.apiKey.trim()
        delete headers['Authorization']
      }
    }
    const body = isAnthropic
      ? JSON.stringify({
          model: req.model.trim(),
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        })
      : JSON.stringify({
          model: req.model.trim(),
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    const start = Date.now()
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal
      })
      const latencyMs = Date.now() - start
      if (!res.ok) {
        let detail = res.statusText
        try {
          const err = (await res.json()) as { error?: { message?: string }; message?: string }
          detail = err?.error?.message ?? err?.message ?? detail
        } catch {
          /* ignore */
        }
        throw new Error(`HTTP ${res.status}: ${detail}`)
      }
      return { ok: true, latencyMs }
    } finally {
      clearTimeout(timeout)
    }
  })

  return () => {
    for (const login of activeLogins.values()) login.controller.abort()
    activeLogins.clear()
    for (const requestId of pendingPrompts.keys()) {
      rejectPrompt(requestId, new Error('Provider service stopped.'))
    }
    ipcMain.removeHandler(PROVIDER_IPC.list)
    ipcMain.removeHandler(PROVIDER_IPC.setApiKey)
    ipcMain.removeHandler(PROVIDER_IPC.removeApiKey)
    ipcMain.removeHandler(PROVIDER_IPC.listCustom)
    ipcMain.removeHandler(PROVIDER_IPC.upsertCustom)
    ipcMain.removeHandler(PROVIDER_IPC.removeCustom)
    ipcMain.removeHandler(PROVIDER_IPC.listOAuth)
    ipcMain.removeHandler(PROVIDER_IPC.loginOAuth)
    ipcMain.removeHandler(PROVIDER_IPC.logoutOAuth)
    ipcMain.removeHandler(PROVIDER_IPC.cancelOAuth)
    ipcMain.removeHandler(PROVIDER_IPC.respondOAuthPrompt)
    ipcMain.removeHandler(PROVIDER_IPC.fetchCustomModels)
    ipcMain.removeHandler(PROVIDER_IPC.testCustomModel)
  }
}
