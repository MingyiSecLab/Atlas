/**
 * probe_auth_endpoints: 按常见认证端点字典批量探测登录/令牌/用户资源入口 (active)。
 *
 * 安全工具域成员：实现 pentest 的 RuntimePentestTool 契约，由
 * pentest 域的 executor 与安全闸统一调度：
 * - 发起探测前对 baseUrl 与每一个构造 URL 经 isTargetInScope 逐一校验 scope
 * - 每条路径先 GET 再 POST `{}`（空 JSON），纯探测型请求，不携带凭据、不暴力破解
 * - 单请求 8s 超时，单条失败不影响其余路径；每轮迭代响应外部 abort
 */
import { isTargetInScope } from '../../pentest/scope.js'
import type { RuntimePentestTool } from '../../pentest/tools.js'

const MAX_BODY_BYTES = 64 * 1024
const PER_REQUEST_TIMEOUT_MS = 8_000

const AUTH_ENDPOINT_PATTERNS: ReadonlyArray<{ path: string; purpose: string }> = [
  ...[
    '/api/login',
    '/api/auth/login',
    '/api/v1/login',
    '/api/v1/auth/login',
    '/api/signin',
    '/api/auth/signin',
    '/api/authenticate',
    '/auth/login',
    '/auth/signin',
    '/login',
    '/signin'
  ].map((path) => ({ path, purpose: 'login' })),
  ...['/api/token', '/api/auth/token', '/api/oauth/token', '/oauth/token', '/token', '/api/session'].map(
    (path) => ({ path, purpose: 'token' })
  ),
  ...[
    '/api/me',
    '/api/user',
    '/api/profile',
    '/api/users/me',
    '/me',
    '/user',
    '/api/account',
    '/account'
  ].map((path) => ({ path, purpose: 'user' })),
  ...['/api/refresh', '/api/auth/refresh', '/api/token/refresh', '/refresh'].map((path) => ({
    path,
    purpose: 'refresh'
  })),
  ...[
    '/api/data',
    '/api/protected',
    '/api/private',
    '/api/secure',
    '/data',
    '/protected',
    '/private',
    '/secure',
    '/api/v1/data',
    '/api/v1/protected',
    '/admin',
    '/api/admin',
    '/dashboard',
    '/api/dashboard'
  ].map((path) => ({ path, purpose: 'protected' }))
]

const PROBE_AUTH_DESCRIPTION = [
  'Probe common authentication endpoint patterns to discover where to authenticate',
  '(login, token, user, refresh, and protected resource paths, both GET and POST).',
  'Use when detect_auth_scheme finds no clear scheme or the target is a JSON API',
  'whose login endpoint is unknown. Arguments: baseUrl (required, e.g. https://example.com).',
  'Returns discovered endpoints with auth indicators and a recommended login approach.',
  'Base URL must remain inside authorized scope.'
].join(' ')

interface DiscoveredEndpoint {
  path: string
  methods: string[]
  authIndicators: string[]
  likelyPurpose: string
}

function normalizeBaseUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(`probe_auth_endpoints requires a valid base URL, got: ${rawUrl}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('probe_auth_endpoints requires an http or https base URL.')
  }
  url.username = ''
  url.password = ''
  url.hash = ''
  return url
}

function mergeAbortSignals(signal: AbortSignal | undefined): AbortSignal {
  const signals = [AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS)]
  if (signal) signals.push(signal)
  return AbortSignal.any(signals)
}

async function probeWithGet(url: string, context: { signal?: AbortSignal }): Promise<{
  hit: boolean
  indicators: string[]
}> {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    headers: { 'user-agent': 'mingyi-auth-prober/0.1' },
    signal: mergeAbortSignals(context.signal)
  })
  if (response.status === 404) return { hit: false, indicators: [] }

  const indicators: string[] = []
  if (response.status === 401) indicators.push('requires auth (401)')
  if (response.status === 200) indicators.push('accessible (200)')
  if (response.status === 403) indicators.push('forbidden (403)')
  const wwwAuth = response.headers.get('www-authenticate')
  if (wwwAuth) {
    const lowerAuth = wwwAuth.toLowerCase()
    if (lowerAuth.includes('basic')) indicators.push('HTTP Basic Auth')
    if (lowerAuth.includes('bearer')) indicators.push('Bearer token required')
  }
  return { hit: true, indicators }
}

async function probeWithPost(url: string, context: { signal?: AbortSignal }): Promise<{
  hit: boolean
  indicators: string[]
}> {
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json', 'user-agent': 'mingyi-auth-prober/0.1' },
    body: '{}',
    signal: mergeAbortSignals(context.signal)
  })
  if (response.status === 404) return { hit: false, indicators: [] }

  const buffer = await response.arrayBuffer()
  const body = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, MAX_BODY_BYTES))
  const bodyLower = body.toLowerCase()

  const indicators: string[] = []
  if (response.status === 400) indicators.push('expects body (400)')
  if (response.status === 401) indicators.push('invalid credentials (401)')
  if (response.status === 200) indicators.push('POST accessible (200)')
  if (bodyLower.includes('username') || bodyLower.includes('password')) {
    indicators.push('expects credentials')
  }
  if (bodyLower.includes('token') || bodyLower.includes('jwt')) indicators.push('returns tokens')
  return { hit: true, indicators }
}

export function createProbeAuthEndpointsTool(): RuntimePentestTool {
  return {
    name: 'probe_auth_endpoints',
    kind: 'active',
    description: PROBE_AUTH_DESCRIPTION,
    timeoutMs: 120_000,
    async execute(command, context) {
      const args = command.arguments ?? {}
      const rawBaseUrl =
        (typeof args.baseUrl === 'string' && args.baseUrl) ||
        (typeof args.url === 'string' && args.url) ||
        command.targetRef

      if (!rawBaseUrl) {
        throw new Error('probe_auth_endpoints requires arguments.baseUrl.')
      }

      const baseUrl = normalizeBaseUrl(rawBaseUrl)
      const baseHref = baseUrl.toString()

      const discoveredEndpoints: DiscoveredEndpoint[] = []
      for (const { path, purpose } of AUTH_ENDPOINT_PATTERNS) {
        if (context.signal?.aborted) break

        const url = new URL(path, baseHref).toString()
        if (!isTargetInScope(url, context.scope)) {
          throw new Error(`Target is outside authorized scope: ${url}`)
        }

        const methods: string[] = []
        const authIndicators: string[] = []

        try {
          const getProbe = await probeWithGet(url, context)
          if (getProbe.hit) {
            methods.push('GET')
            authIndicators.push(...getProbe.indicators)
          }
        } catch {
          // Ignore individual errors
        }
        if (context.signal?.aborted) break

        try {
          const postProbe = await probeWithPost(url, context)
          if (postProbe.hit) {
            methods.push('POST')
            authIndicators.push(...postProbe.indicators)
          }
        } catch {
          // Ignore individual errors
        }

        if (methods.length > 0) {
          discoveredEndpoints.push({ path, methods, authIndicators, likelyPurpose: purpose })
        }
      }

      const basicAuthEndpoint = discoveredEndpoints.find((endpoint) =>
        endpoint.authIndicators.includes('HTTP Basic Auth')
      )
      const loginEndpoint =
        discoveredEndpoints.find(
          (endpoint) =>
            endpoint.likelyPurpose === 'login' &&
            endpoint.methods.includes('POST') &&
            (endpoint.authIndicators.includes('expects body (400)') ||
              endpoint.authIndicators.includes('invalid credentials (401)') ||
              endpoint.authIndicators.includes('expects credentials'))
        ) ||
        discoveredEndpoints.find(
          (endpoint) => endpoint.likelyPurpose === 'login' && endpoint.methods.includes('POST')
        )

      let message: string
      if (discoveredEndpoints.length === 0) {
        message = 'No auth endpoints found at common paths'
      } else if (basicAuthEndpoint) {
        message = `Found HTTP Basic Auth at ${basicAuthEndpoint.path}. Use Authorization: Basic base64(user:pass).`
      } else if (loginEndpoint) {
        message = `Found ${discoveredEndpoints.length} auth endpoints. Recommended: POST ${loginEndpoint.path}`
      } else {
        message = `Found ${discoveredEndpoints.length} potential auth endpoints`
      }

      return {
        output: JSON.stringify(
          {
            success: true,
            endpoints: discoveredEndpoints,
            recommendedLoginEndpoint: basicAuthEndpoint?.path || loginEndpoint?.path,
            recommendedMethod: basicAuthEndpoint
              ? 'GET (with Basic Auth header)'
              : loginEndpoint
                ? 'POST'
                : undefined,
            message
          },
          null,
          2
        ),
        exitCode: 0
      }
    }
  }
}
