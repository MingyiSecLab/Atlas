/**
 * http_request：单次任意方法的 HTTP 请求工具（active）。
 *
 * 安全工具域的成员：实现 pentest 的 RuntimePentestTool 契约，由
 * pentest 域的 executor 与安全闸统一调度（见 ADR-0003）：
 * - executor 只校验 command.targetRef，arguments.url 指定的每个请求目标
 *   （含重定向的每一跳）在这里用 isTargetInScope 逐跳把关
 * - 破坏性请求（DELETE 方法、删库语句、方法覆盖头等）经 assertHttpActionAllowed
 *   按 allowDestructive 闸住（fail-closed）
 * - 超时/abort/并发/速率/输出截断由 executor 统一承载，本工具只负责请求级
 *   超时与重定向链
 * - 原实现的 prompt-injection 库、沙箱 curl 路径、session 凭据头与专用限流器
 *   在本仓库没有对应能力，不迁移
 */
import { assertHttpActionAllowed } from '../../pentest/destructive-guard.js'
import { isTargetInScope } from '../../pentest/scope.js'
import type { RuntimePentestTool } from '../../pentest/tools.js'

const MAX_REQUEST_BODY_BYTES = 256 * 1024
const MAX_RESPONSE_BODY_BYTES = 128 * 1024
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_TIMEOUT_MS = 25_000
const MAX_REDIRECTS = 5
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])

const HTTP_REQUEST_DESCRIPTION = [
  'Send one HTTP request (GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS) and capture the status line,',
  'response headers, and truncated body.',
  'Arguments: url (required), method (default GET), headers (JSON-encoded object string),',
  'body (string, for POST/PUT/PATCH), followRedirects (default false so redirect targets stay observable),',
  'timeout (ms, default 10000).',
  'Every requested URL — including redirect hops — must stay inside the authorized scope.',
  'Destructive requests (HTTP DELETE, destructive SQL/NoSQL payloads, method-override headers)',
  'are blocked unless destructive testing is enabled for the engagement.',
  'Analyze responses for security headers (X-Frame-Options, CSP, HSTS, X-Content-Type-Options,',
  'Permissions-Policy), cookie flags (HttpOnly/Secure/SameSite), verbose error disclosure,',
  'and CORS origin reflection: send "Origin: https://evil.example.com" and check whether',
  'Access-Control-Allow-Origin echoes it back together with Allow-Credentials (high severity).',
  'CORS findings only matter on endpoints that actually use authentication.'
].join(' ')

function stringArgument(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseHeaders(raw: unknown): Record<string, string> | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('http_request headers must be a JSON-encoded object string.')
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('http_request headers must be a JSON object.')
  }
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new Error(`http_request header "${name}" must be a string value.`)
    }
    headers[name] = String(value)
  }
  return Object.keys(headers).length > 0 ? headers : undefined
}

function normalizeUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(`http_request requires a valid URL, got: ${rawUrl}.`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('http_request requires an http or https URL.')
  }
  url.username = ''
  url.password = ''
  url.hash = ''
  return url
}

function formatResponse(url: URL, status: number, statusText: string, response: {
  headers: Record<string, string>
  body: string
}): string {
  const headerLines = Object.entries(response.headers).map(([name, value]) => `${name}: ${value}`)
  return [`HTTP/1.1 ${status} ${statusText}`, `final-url: ${url.toString()}`, ...headerLines, '', response.body].join('\n')
}

function assertInScope(url: URL, scope: readonly string[]): void {
  if (!isTargetInScope(url.toString(), scope)) {
    throw new Error(`Target is outside authorized scope: ${url.toString()}.`)
  }
}

function parseSetCookieHeaders(headers: Headers): Array<{ name: string; value: string }> {
  const rawList: string[] =
    typeof (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [headers.get('set-cookie')].filter((s): s is string => Boolean(s))

  const results: Array<{ name: string; value: string }> = []
  for (const item of rawList) {
    const firstPart = item.split(';')[0]?.trim()
    if (!firstPart) continue
    const eqIdx = firstPart.indexOf('=')
    if (eqIdx > 0) {
      const name = firstPart.slice(0, eqIdx).trim()
      const value = firstPart.slice(eqIdx + 1).trim()
      if (name) {
        results.push({ name, value })
      }
    }
  }
  return results
}

function parseCookieHeader(cookieHeader: string | undefined): Map<string, string> {
  const map = new Map<string, string>()
  if (!cookieHeader) return map
  for (const pair of cookieHeader.split(';')) {
    const trimmed = pair.trim()
    if (!trimmed) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const name = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()
      if (name) {
        map.set(name, value)
      }
    }
  }
  return map
}

function serializeCookieMap(map: Map<string, string>): string {
  return Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

export interface HttpRequestToolOptions {
  /** 域名/主机名维度的持久化 Cookie 存储，省略时由工具实例自动创建并在多次调用中共享 */
  cookieJar?: Map<string, Map<string, string>>
}

export function createHttpRequestTool(options?: HttpRequestToolOptions): RuntimePentestTool {
  const cookieJar = options?.cookieJar ?? new Map<string, Map<string, string>>()

  return {
    name: 'http_request',
    kind: 'active',
    description: HTTP_REQUEST_DESCRIPTION,
    timeoutMs: 30_000,
    async execute(command, context) {
      const args = command.arguments
      const rawUrl = stringArgument(args.url) ?? command.targetRef
      const method = (stringArgument(args.method) ?? 'GET').toUpperCase()
      if (!ALLOWED_METHODS.has(method)) {
        throw new Error(`http_request does not support method: ${method}.`)
      }
      const baseHeaders = parseHeaders(args.headers) ?? {}
      const body = stringArgument(args.body)
      if (body !== undefined && body.length > MAX_REQUEST_BODY_BYTES) {
        throw new Error(`http_request body exceeds the ${MAX_REQUEST_BODY_BYTES} byte cap.`)
      }
      const requestedTimeout = Number(args.timeout)
      const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
        ? Math.min(Math.floor(requestedTimeout), MAX_TIMEOUT_MS)
        : DEFAULT_TIMEOUT_MS
      const followRedirects = args.followRedirects === true || args.followRedirects === 'true'

      const url = normalizeUrl(rawUrl)
      // 覆盖整条重定向链的单次超时；executor 的 withToolTimeout 之外再兜一层
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(timeoutMs)])

      const explicitCookieKey = Object.keys(baseHeaders).find(k => k.toLowerCase() === 'cookie')
      const explicitCookieStr = explicitCookieKey ? baseHeaders[explicitCookieKey] : undefined

      function getEffectiveCookieString(host: string): string | undefined {
        const stored = cookieJar.get(host)
        const explicit = parseCookieHeader(explicitCookieStr)
        const merged = new Map<string, string>()
        if (stored) {
          for (const [k, v] of stored.entries()) {
            merged.set(k, v)
          }
        }
        for (const [k, v] of explicit.entries()) {
          merged.set(k, v)
        }
        return merged.size > 0 ? serializeCookieMap(merged) : undefined
      }

      function updateHostCookies(host: string, newCookies: Array<{ name: string; value: string }>) {
        if (newCookies.length === 0) return
        let map = cookieJar.get(host)
        if (!map) {
          map = new Map()
          cookieJar.set(host, map)
        }
        for (const { name, value } of newCookies) {
          map.set(name, value)
        }
      }

      function buildHopHeaders(host: string): Record<string, string> {
        const headers: Record<string, string> = { ...baseHeaders }
        const cookieStr = getEffectiveCookieString(host)
        if (cookieStr) {
          if (explicitCookieKey && explicitCookieKey !== 'Cookie') {
            delete headers[explicitCookieKey]
          }
          headers['Cookie'] = cookieStr
        } else if (explicitCookieKey) {
          delete headers[explicitCookieKey]
        }
        return headers
      }

      let currentUrl = url
      let currentMethod = method
      let currentBody = body
      let currentHeaders = buildHopHeaders(currentUrl.host)

      for (let hop = 0; ; hop++) {
        assertInScope(currentUrl, context.scope)
        assertHttpActionAllowed(
          { method: currentMethod, url: currentUrl.toString(), body: currentBody, headers: currentHeaders },
          { allowDestructive: context.allowDestructive }
        )

        let response: Response
        try {
          response = await fetch(currentUrl, {
            method: currentMethod,
            headers: currentHeaders,
            body: currentMethod === 'GET' || currentMethod === 'HEAD' ? undefined : currentBody,
            redirect: 'manual',
            signal
          })
        } catch (error) {
          if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
            throw new Error(
              context.signal.aborted
                ? 'http_request was aborted by the caller.'
                : `http_request timed out after ${timeoutMs}ms.`
            )
          }
          throw error
        }

        const setCookies = parseSetCookieHeaders(response.headers)
        updateHostCookies(currentUrl.host, setCookies)

        const location = response.headers.get('location')
        const isRedirect = response.status >= 300 && response.status < 400 && location !== null
        if (!isRedirect || !followRedirects) {
          return await respond(currentUrl, response)
        }
        // 响应体在重定向下没有证据价值，尽早释放连接
        await response.arrayBuffer().catch(() => undefined)
        if (hop >= MAX_REDIRECTS) {
          throw new Error(`http_request exceeded ${MAX_REDIRECTS} redirect hops at ${location}.`)
        }
        const nextUrl = normalizeUrl(new URL(location, currentUrl).toString())
        // 303 一律转 GET；301/302 按惯例把 POST 降级为 GET；307/308 保留方法与 body
        if (response.status === 303 || ((response.status === 301 || response.status === 302) && currentMethod === 'POST')) {
          currentMethod = 'GET'
          currentBody = undefined
        }
        currentUrl = nextUrl
        currentHeaders = buildHopHeaders(currentUrl.host)
      }
    }
  }
}

async function respond(url: URL, response: Response): Promise<{ output: string; exitCode: number }> {
  const responseHeaders: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value
  })
  const buffer = await response.arrayBuffer()
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, MAX_RESPONSE_BODY_BYTES))
  const body =
    buffer.byteLength > MAX_RESPONSE_BODY_BYTES
      ? `${decoded}\n…(truncated at ${MAX_RESPONSE_BODY_BYTES} bytes)`
      : decoded
  return {
    output: formatResponse(url, response.status, response.statusText, { headers: responseHeaders, body }),
    exitCode: response.status >= 200 && response.status < 400 ? 0 : 1
  }
}
