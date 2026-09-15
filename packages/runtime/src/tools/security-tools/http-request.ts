/**
 * http_request：单次任意方法的 HTTP 请求工具（active）。
 *
 * 安全工具域的成员：实现 pentest 的 RuntimePentestTool 契约，由
 * pentest 域的 executor 与安全闸统一调度（见 ADR-0003）：
 * - executor 只校验 command.targetRef，arguments.url 指定的每个请求目标
 *   （含重定向的每一跳）在这里用 isTargetInScope 逐跳把关
 * - 破坏性请求（DELETE 方法、删库语句、方法覆盖头等）经 assertHttpActionAllowed
 *   按 allowDestructive 闸住（fail-closed）
 * - 超时/abort/并发/速率/输出截断由 executor 统一承载，本工具只负责一次请求链的
 *   总超时预算与重定向链本身
 * - 原实现的 prompt-injection 库、沙箱 curl 路径、session 凭据头与专用限流器
 *   在本仓库没有对应能力，不迁移
 *
 * 相对早期版本补齐的能力（对齐 tests/apex 的 offSecAgent httpRequest，按本仓库
 * 语境取舍后落地）：
 * - Cookie Jar 语义化：解析 Set-Cookie 的 Domain/Path/Secure/HttpOnly/SameSite/
 *   Max-Age/Expires，按 RFC 6265 做域匹配 + 路径匹配 + Secure 限制后回送；
 *   Max-Age<=0 或已过期即删除；明文 HTTP 上拒收 Secure cookie（与浏览器一致）
 * - 重定向链证据化：逐跳记录状态码与目标（redirect-chain 行），跨源跳转自动剥离
 *   Cookie/Authorization 等凭据头并在 note 中留痕
 * - 响应体治理：文本正文内联预览，超限正文与二进制正文落盘到
 *   <artifacts>/.agents/pentest/http/，回传可用 view/search_content 查阅的文件路径，避免证据丢失
 * - 观测注记：缺失的安全响应头、Set-Cookie 标志、耗时（供盲注时序比对）
 * - 请求构造便利：jsonBody / form 免去模型手工拼 JSON 与转义；GET/HEAD 带 body
 *   从「静默丢弃」改为明确报错
 */
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { assertHttpActionAllowed } from '../../pentest/destructive-guard.js'
import { isTargetInScope } from '../../pentest/scope.js'
import type { RuntimePentestTool, RuntimePentestToolContext } from '../../pentest/tools.js'
import { resolvePentestArtifactsRoot } from './documentApp.js'

/** 请求体上限（字节）。 */
const MAX_REQUEST_BODY_BYTES = 256 * 1024
/** 内联预览默认上限（字节）：超出部分落盘，正文只回传前 N 字节。 */
const DEFAULT_INLINE_BYTES = 32 * 1024
/** 内联预览硬上限：单次工具输出不可能超过 executor 的 256KB 截断。 */
const MAX_INLINE_BYTES = 128 * 1024
/** 单次请求读入内存的响应体上限（超出即停止读取，避免被超大响应撑爆内存）。 */
const MAX_READ_BYTES = 2 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_TIMEOUT_MS = 25_000
const DEFAULT_MAX_REDIRECTS = 5
const MAX_REDIRECTS_LIMIT = 10
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
/** 跨源重定向时必须剥离的凭据头，避免把会话泄露给第三方主机。 */
const CREDENTIAL_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization'])
/** 逐响应审计缺失情况的安全响应头（HSTS 只在 https 下有意义，单独处理）。 */
const SECURITY_HEADERS = [
  'content-security-policy',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy'
]
const HSTS_HEADER = 'strict-transport-security'
/** 可安全内联解码为文本的 content-type。 */
const TEXTUAL_CONTENT_TYPE =
  /^(?:text\/|application\/(?:json|xml|javascript|ecmascript|x-www-form-urlencoded|graphql|graphql-response\+json|ld\+json|soap\+xml|xhtml\+xml|x-yaml|yaml)|image\/svg\+xml)/

const HTTP_REQUEST_DESCRIPTION = [
  'Send one HTTP request (GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS) and capture the status line, response headers, timing, redirect chain, and body.',
  'Arguments: url (required), method (default GET), headers (JSON-encoded object string), body (string, for POST/PUT/PATCH),',
  'jsonBody (object or JSON string; sets Content-Type: application/json unless overridden), form (object; urlencoded body),',
  'followRedirects (default false so redirect targets stay observable), maxRedirects (default 5), timeout (ms, default 10000, max 25000), saveResponse (default true).',
  'A CookieJar persists Set-Cookie attributes (Domain/Path/Secure/HttpOnly/SameSite/Max-Age) per host and replays them on later calls and redirect hops;',
  'pass an explicit "Cookie" header to override for a single request.',
  'Every requested URL - including redirect hops - must stay inside the authorized scope, and credential headers are dropped when a redirect crosses to another origin.',
  'Redirect hops are reported on the redirect-chain line so 3xx evidence (Location, Set-Cookie) survives even when following.',
  'Text bodies beyond the inline preview, and binary bodies, are saved under .agents/pentest/http/ and the file path is returned for view/search_content.',
  'Destructive requests (HTTP DELETE, destructive SQL/NoSQL payloads, method-override headers)',
  'are blocked unless destructive testing is enabled for the engagement.',
  'Analyze responses for security headers (X-Frame-Options, CSP, HSTS, X-Content-Type-Options, Permissions-Policy;',
  'X-XSS-Protection is deprecated by all major browsers, recommend CSP instead),',
  'cookie flags (HttpOnly/Secure/SameSite), verbose error disclosure, and response timing (blind injection).',
  'CORS: Access-Control-Allow-Origin "*" without credentials is low impact; "*" plus Allow-Credentials: true is blocked by browsers (misconfiguration only);',
  'a reflected Origin plus Allow-Credentials: true is high severity - actively send "Origin: https://evil.example.com" and check whether ACAO echoes it back;',
  'ACAO "null" with credentials is exploitable from sandboxed iframes. CORS only matters on endpoints that actually use authentication.',
  'Common testing patterns: test with/without authentication, vary User-Agent, probe /api/, /v1/, /graphql, admin panels (/admin, /wp-admin), and backup files (.bak, .old, ~, .swp).'
].join(' ')

function stringArgument(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function findHeaderKey(headers: Record<string, string>, name: string): string | undefined {
  const lowered = name.toLowerCase()
  return Object.keys(headers).find((key) => key.toLowerCase() === lowered)
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

// ---------------------------------------------------------------------------
// 请求体构造（body / jsonBody / form）
// ---------------------------------------------------------------------------

interface RequestBodyPlan {
  body?: string
  /** jsonBody / form 推导出的 content-type，仅在同名头缺省时补齐。 */
  implicitContentType?: string
}

function buildRequestBodyPlan(args: Record<string, unknown>): RequestBodyPlan {
  const rawBody = stringArgument(args.body)
  const hasJson = args.jsonBody !== undefined && args.jsonBody !== null
  const hasForm = args.form !== undefined && args.form !== null
  const provided = [rawBody !== undefined, hasJson, hasForm].filter(Boolean).length
  if (provided > 1) {
    throw new Error('http_request accepts only one of body, jsonBody, or form.')
  }

  if (hasJson) {
    const json = args.jsonBody
    const serialized = typeof json === 'string' ? json : JSON.stringify(json)
    if (serialized === undefined) {
      throw new Error('http_request jsonBody must be JSON-serializable.')
    }
    return { body: serialized, implicitContentType: 'application/json' }
  }

  if (hasForm) {
    const source = args.form
    if (typeof source !== 'object' || source === null || Array.isArray(source)) {
      throw new Error('http_request form must be a JSON object of field names to values.')
    }
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      params.append(key, value === null || value === undefined ? '' : String(value))
    }
    return {
      body: params.toString(),
      implicitContentType: 'application/x-www-form-urlencoded'
    }
  }

  return { body: rawBody }
}

// ---------------------------------------------------------------------------
// Cookie Jar（RFC 6265 子集：域匹配 / 路径匹配 / 过期 / Secure）
// ---------------------------------------------------------------------------

interface StoredCookie {
  name: string
  value: string
  /** 显式 Domain 属性的值（已去前导点）；host-only cookie 时为请求主机名。 */
  domain: string
  /** 无 Domain 属性：只回送给完全同名的主机。 */
  hostOnly: boolean
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite?: string
  /** 绝对过期时间戳（毫秒）；session cookie 为空。 */
  expiresAt?: number
}

export interface CookieFlagObservation {
  name: string
  httpOnly: boolean
  secure: boolean
  sameSite?: string
  /** Max-Age<=0 或 Expires 已过期：服务端在指示删除。 */
  deleted: boolean
}

function defaultCookiePath(requestPath: string): string {
  if (!requestPath.startsWith('/') || requestPath === '/') return '/'
  const lastSlash = requestPath.lastIndexOf('/')
  return lastSlash <= 0 ? '/' : requestPath.slice(0, lastSlash)
}

function parseSetCookie(
  raw: string,
  originHost: string,
  originPath: string
): StoredCookie | undefined {
  const parts = raw.split(';')
  const first = (parts.shift() ?? '').trim()
  const equalsIndex = first.indexOf('=')
  if (equalsIndex <= 0) return undefined
  const name = first.slice(0, equalsIndex).trim()
  const value = first.slice(equalsIndex + 1).trim()
  if (!name) return undefined

  const cookie: StoredCookie = {
    name,
    value,
    domain: originHost,
    hostOnly: true,
    path: defaultCookiePath(originPath),
    secure: false,
    httpOnly: false
  }

  for (const rawAttribute of parts) {
    const attribute = rawAttribute.trim()
    if (!attribute) continue
    const attributeEquals = attribute.indexOf('=')
    const key = (attributeEquals === -1 ? attribute : attribute.slice(0, attributeEquals))
      .trim()
      .toLowerCase()
    const attributeValue = attributeEquals === -1 ? '' : attribute.slice(attributeEquals + 1).trim()
    switch (key) {
      case 'domain': {
        const domain = attributeValue.replace(/^\./, '').toLowerCase()
        // 不接受与来源主机无关的 Domain（防被写别的域）。
        if (domain && (originHost === domain || originHost.endsWith(`.${domain}`))) {
          cookie.domain = domain
          cookie.hostOnly = false
        }
        break
      }
      case 'path':
        if (attributeValue.startsWith('/')) cookie.path = attributeValue
        break
      case 'secure':
        cookie.secure = true
        break
      case 'httponly':
        cookie.httpOnly = true
        break
      case 'samesite':
        cookie.sameSite = attributeValue || 'unspecified'
        break
      case 'max-age': {
        const seconds = Number(attributeValue)
        if (Number.isFinite(seconds)) cookie.expiresAt = Date.now() + seconds * 1000
        break
      }
      case 'expires': {
        const timestamp = Date.parse(attributeValue)
        if (!Number.isNaN(timestamp)) cookie.expiresAt = timestamp
        break
      }
      default:
        break
    }
  }

  return cookie
}

function cookieDomainMatches(host: string, cookie: StoredCookie): boolean {
  if (cookie.hostOnly) return host === cookie.domain
  return host === cookie.domain || host.endsWith(`.${cookie.domain}`)
}

function cookiePathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true
  if (!requestPath.startsWith(cookiePath)) return false
  if (cookiePath.endsWith('/')) return true
  return requestPath.charAt(cookiePath.length) === '/'
}

class CookieJar {
  private readonly cookies = new Map<string, StoredCookie>()
  private readonly importedHosts = new Set<string>()

  /**
   * @param shared 兼容既有调用方传入的 host -> name -> value 共享表；只作为
   *   首次接触某主机时的种子导入，并在写入/删除时同步回写，便于宿主观察。
   */
  constructor(private readonly shared?: Map<string, Map<string, string>>) {}

  private keyOf(cookie: Pick<StoredCookie, 'domain' | 'path' | 'name'>): string {
    return `${cookie.domain}\u0000${cookie.path}\u0000${cookie.name}`
  }

  private importShared(host: string): void {
    if (!this.shared || this.importedHosts.has(host)) return
    this.importedHosts.add(host)
    const stored = this.shared.get(host)
    if (!stored) return
    for (const [name, value] of stored) {
      const cookie: StoredCookie = {
        name,
        value,
        domain: host,
        hostOnly: true,
        path: '/',
        secure: false,
        httpOnly: false
      }
      const key = this.keyOf(cookie)
      if (!this.cookies.has(key)) this.cookies.set(key, cookie)
    }
  }

  private mirrorShared(host: string, name: string, value: string | undefined): void {
    if (!this.shared) return
    if (value === undefined) {
      this.shared.get(host)?.delete(name)
      return
    }
    let bucket = this.shared.get(host)
    if (!bucket) {
      bucket = new Map()
      this.shared.set(host, bucket)
    }
    bucket.set(name, value)
  }

  /** 落库一次响应的 Set-Cookie，返回用于输出注记的标志观测结果。 */
  storeFromResponse(url: URL, rawSetCookies: readonly string[]): CookieFlagObservation[] {
    const host = url.hostname.toLowerCase()
    this.importShared(host)
    const observations: CookieFlagObservation[] = []
    for (const raw of rawSetCookies) {
      const cookie = parseSetCookie(raw, host, url.pathname || '/')
      if (!cookie) continue
      const expired = cookie.expiresAt !== undefined && cookie.expiresAt <= Date.now()
      // 与浏览器一致：明文 HTTP 上拒收 Secure cookie（避免把 https 会话降级写入）。
      const rejectedOnPlaintext = cookie.secure && url.protocol !== 'https:'
      if (expired || rejectedOnPlaintext) {
        this.cookies.delete(this.keyOf(cookie))
        this.mirrorShared(host, cookie.name, undefined)
        observations.push({
          name: cookie.name,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite,
          deleted: expired
        })
        continue
      }
      this.cookies.set(this.keyOf(cookie), cookie)
      this.mirrorShared(host, cookie.name, cookie.value)
      observations.push({
        name: cookie.name,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
        deleted: false
      })
    }
    return observations
  }

  /** 按 RFC 6265 选出当前请求可回送的 cookie（路径更长的优先）。 */
  headerFor(url: URL): Array<{ name: string; value: string }> {
    const host = url.hostname.toLowerCase()
    this.importShared(host)
    const requestPath = url.pathname || '/'
    const secureTransport = url.protocol === 'https:'
    const now = Date.now()
    const matches: StoredCookie[] = []
    for (const [key, cookie] of this.cookies) {
      if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) {
        this.cookies.delete(key)
        continue
      }
      if (!cookieDomainMatches(host, cookie)) continue
      if (!cookiePathMatches(requestPath, cookie.path)) continue
      if (cookie.secure && !secureTransport) continue
      matches.push(cookie)
    }
    matches.sort((a, b) => b.path.length - a.path.length || (a.name < b.name ? -1 : 1))
    return matches.map((cookie) => ({ name: cookie.name, value: cookie.value }))
  }
}

function parseCookieHeader(
  cookieHeader: string | undefined
): Array<{ name: string; value: string }> {
  const result: Array<{ name: string; value: string }> = []
  if (!cookieHeader) return result
  for (const pair of cookieHeader.split(';')) {
    const trimmed = pair.trim()
    if (!trimmed) continue
    const equalsIndex = trimmed.indexOf('=')
    if (equalsIndex > 0) {
      const name = trimmed.slice(0, equalsIndex).trim()
      if (name) result.push({ name, value: trimmed.slice(equalsIndex + 1).trim() })
    }
  }
  return result
}

/** jar 内 cookie 在前，显式 Cookie 头在后（同名时显式值获胜）。 */
function mergeCookiePairs(
  jarCookies: Array<{ name: string; value: string }>,
  explicitCookies: Array<{ name: string; value: string }>
): string | undefined {
  if (jarCookies.length === 0 && explicitCookies.length === 0) return undefined
  const merged = new Map<string, string>()
  for (const { name, value } of [...jarCookies, ...explicitCookies]) merged.set(name, value)
  return Array.from(merged.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

function readSetCookieHeaders(headers: Headers): string[] {
  const withGetSetCookie = headers as unknown as { getSetCookie?: () => string[] }
  if (typeof withGetSetCookie.getSetCookie === 'function') {
    return withGetSetCookie.getSetCookie()
  }
  const single = headers.get('set-cookie')
  return single ? [single] : []
}

// ---------------------------------------------------------------------------
// 响应体读取与落盘
// ---------------------------------------------------------------------------

function isTextualContentType(contentType: string): boolean | undefined {
  const type = (contentType.split(';')[0] ?? '').trim().toLowerCase()
  if (!type) return undefined
  if (TEXTUAL_CONTENT_TYPE.test(type) || type.endsWith('+json') || type.endsWith('+xml')) {
    return true
  }
  return false
}

function hasBinaryBytes(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 512)
  if (sample.length === 0) return false
  let suspicious = 0
  for (const byte of sample) {
    if (byte === 0) return true
    if ((byte < 9 || (byte > 13 && byte < 32)) && byte !== 0x1b) suspicious += 1
  }
  return suspicious / sample.length > 0.1
}

async function readCapped(
  response: Response,
  cap: number
): Promise<{ buffer: Buffer; readTruncated: boolean }> {
  const stream = response.body
  if (!stream) return { buffer: Buffer.alloc(0), readTruncated: false }
  const reader = stream.getReader()
  const chunks: Buffer[] = []
  let total = 0
  let readTruncated = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      const chunk = Buffer.from(value)
      const remaining = cap - total
      if (chunk.byteLength >= remaining) {
        chunks.push(chunk.subarray(0, Math.max(remaining, 0)))
        total += Math.max(remaining, 0)
        readTruncated = true
        break
      }
      chunks.push(chunk)
      total += chunk.byteLength
    }
  } finally {
    // 提前 break / 出错时主动取消，尽快释放连接。
    await reader.cancel().catch(() => undefined)
  }
  return { buffer: Buffer.concat(chunks, total), readTruncated }
}

function artifactExtension(contentType: string, binary: boolean): string {
  const type = (contentType.split(';')[0] ?? '').trim().toLowerCase()
  if (type.includes('json')) return 'json'
  if (type.includes('html')) return 'html'
  if (type.includes('xml')) return 'xml'
  if (type.includes('javascript')) return 'js'
  if (type.startsWith('text/')) return 'txt'
  return binary ? 'bin' : 'txt'
}

interface ArtifactWriter {
  write(data: Buffer, contentType: string, binary: boolean): Promise<string | undefined>
}

function createArtifactWriter(
  context: RuntimePentestToolContext,
  enabled: boolean
): ArtifactWriter {
  return {
    async write(data, contentType, binary) {
      if (!enabled) return undefined
      try {
        // 与 document_app / document_endpoint 共用产物根：关联工程时落工程根目录，
        // 未关联工程时按会话隔离到 ~/.atlas/sessions/<sessionId>/。
        const root = resolve(resolvePentestArtifactsRoot(context))
        const directory = join(root, '.agents', 'pentest', 'http')
        if (directory !== root && !directory.startsWith(root + sep)) {
          throw new Error('artifact directory escapes the workspace root')
        }
        await mkdir(directory, { recursive: true })
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const suffix = Math.random().toString(36).slice(2, 8)
        const filename = `response-${stamp}-${suffix}.${artifactExtension(contentType, binary)}`
        const filePath = resolve(directory, filename)
        if (!filePath.startsWith(root + sep)) {
          throw new Error('artifact path escapes the workspace root')
        }
        await writeFile(filePath, data)
        return filePath
      } catch {
        // 落盘失败不能把一次成功的请求变成失败：正文仍以截断预览返回。
        return undefined
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 证据格式化
// ---------------------------------------------------------------------------

function describeCookieFlags(
  observations: readonly CookieFlagObservation[],
  scheme: string
): string[] {
  if (observations.length === 0) return []
  const lines = observations.map((cookie) => {
    const flags = [
      `HttpOnly=${cookie.httpOnly ? 'yes' : 'no'}`,
      `Secure=${cookie.secure ? 'yes' : 'no'}`,
      `SameSite=${cookie.sameSite ?? 'absent'}`
    ]
    return `${cookie.name} ${flags.join(' ')}${cookie.deleted ? ' (deleted by server)' : ''}`
  })
  const output = [`cookie-flags: ${lines.join('; ')}`]
  if (scheme !== 'https:') {
    output.push(
      'note: request used plaintext http - Secure-attribute absence cannot be verified without TLS.'
    )
  }
  return output
}

function describeMissingSecurityHeaders(
  present: ReadonlySet<string>,
  scheme: string,
  status: number
): string[] {
  if (status >= 400) return []
  const expected = scheme === 'https:' ? [...SECURITY_HEADERS, HSTS_HEADER] : [...SECURITY_HEADERS]
  const missing = expected.filter((header) => !present.has(header))
  if (missing.length === 0) return ['missing-security-headers: (none of the audited set)']
  return [
    `missing-security-headers: ${missing.join(', ')}`,
    'note: header presence only - CSP may also be delivered via <meta http-equiv>; treat as an observation, not a finding.'
  ]
}

/** 重定向链的一跳：`<状态码> <来源路径> -> <Location>`。 */
function hopLabel(status: number, from: URL, location: string): string {
  return `${status} ${from.pathname}${from.search} -> ${location}`
}

function formatRedirectChain(chain: readonly string[], following: boolean): string {
  if (chain.length === 0) return 'redirect-chain: (none)'
  const suffix = following ? '' : ' (not followed)'
  return `redirect-chain: ${chain.join(' -> ')}${suffix}`
}

function formatEvidence(input: {
  status: number
  statusText: string
  method: string
  finalUrl: string
  durationMs: number
  redirectChain: readonly string[]
  following: boolean
  bodyBytes: number
  binary: boolean
  notes: readonly string[]
  /** 保留重复头（尤其是多个 Set-Cookie）的逐条记录，按线上原样逐行还原。 */
  headerEntries: ReadonlyArray<readonly [string, string]>
  body: string
}): string {
  const headerLines = input.headerEntries.map(([name, value]) => `${name}: ${value}`)
  const lines = [
    `HTTP/1.1 ${input.status} ${input.statusText}`,
    `final-url: ${input.finalUrl}`,
    `method: ${input.method}`,
    `duration-ms: ${input.durationMs}`,
    formatRedirectChain(input.redirectChain, input.following),
    `body-bytes: ${input.bodyBytes}${input.binary ? ' (binary)' : ''}`,
    ...input.notes,
    ...headerLines,
    '',
    input.body
  ]
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export interface HttpRequestToolOptions {
  /** 域名/主机名维度的共享 Cookie 存储，省略时由工具实例自动创建并在多次调用中共享 */
  cookieJar?: Map<string, Map<string, string>>
  /** 响应体内联预览上限（字节），默认 32KB；超出部分落盘为证据文件。 */
  maxInlineBytes?: number
  /** 超限正文与二进制正文是否落盘到 .agents/pentest/http/，默认 true。 */
  persistResponses?: boolean
}

export function createHttpRequestTool(options?: HttpRequestToolOptions): RuntimePentestTool {
  const jar = new CookieJar(options?.cookieJar)
  const inlineBytes = Math.min(
    Math.max(Math.floor(options?.maxInlineBytes ?? DEFAULT_INLINE_BYTES), 1),
    MAX_INLINE_BYTES
  )

  return {
    name: 'http_request',
    kind: 'active',
    description: HTTP_REQUEST_DESCRIPTION,
    timeoutMs: 30_000,
    async execute(command, context) {
      const args = command.arguments ?? {}
      const rawUrl = stringArgument(args.url) ?? command.targetRef
      const method = (stringArgument(args.method) ?? 'GET').toUpperCase()
      if (!ALLOWED_METHODS.has(method)) {
        throw new Error(`http_request does not support method: ${method}.`)
      }

      const baseHeaders = parseHeaders(args.headers) ?? {}
      const { body, implicitContentType } = buildRequestBodyPlan(args)
      if (body !== undefined && Buffer.byteLength(body) > MAX_REQUEST_BODY_BYTES) {
        throw new Error(
          `http_request body exceeds the ${MAX_REQUEST_BODY_BYTES} byte cap. ` +
            'Upload large payloads through the sandbox and keep request bodies small.'
        )
      }
      if (body !== undefined && (method === 'GET' || method === 'HEAD')) {
        throw new Error(
          `http_request cannot send a body with ${method}; use POST/PUT/PATCH instead.`
        )
      }
      if (implicitContentType && !findHeaderKey(baseHeaders, 'content-type')) {
        baseHeaders['content-type'] = implicitContentType
      }

      const requestedTimeout = Number(args.timeout)
      const timeoutMs =
        Number.isFinite(requestedTimeout) && requestedTimeout > 0
          ? Math.min(Math.floor(requestedTimeout), MAX_TIMEOUT_MS)
          : DEFAULT_TIMEOUT_MS
      const followRedirects = args.followRedirects === true || args.followRedirects === 'true'
      const requestedMaxRedirects = Number(args.maxRedirects)
      const maxRedirects =
        Number.isFinite(requestedMaxRedirects) && requestedMaxRedirects >= 0
          ? Math.min(Math.floor(requestedMaxRedirects), MAX_REDIRECTS_LIMIT)
          : DEFAULT_MAX_REDIRECTS
      const saveResponse = args.saveResponse !== false && args.saveResponse !== 'false'

      const url = normalizeUrl(rawUrl)
      const firstOrigin = url.origin
      const writer = createArtifactWriter(context, options?.persistResponses !== false)
      // 覆盖整条重定向链的单次超时预算；executor 的 withToolTimeout 之外再兜一层。
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(timeoutMs)])
      const notes: string[] = []
      const redirectChain: string[] = []
      const startedAt = Date.now()

      const explicitCookieKey = findHeaderKey(baseHeaders, 'cookie')
      const explicitCookies = explicitCookieKey
        ? parseCookieHeader(baseHeaders[explicitCookieKey])
        : []

      function buildHopHeaders(hopUrl: URL, hop: number): Record<string, string> {
        const headers: Record<string, string> = { ...baseHeaders }
        if (hop > 0 && hopUrl.origin !== firstOrigin) {
          for (const name of Object.keys(headers)) {
            if (CREDENTIAL_HEADERS.has(name.toLowerCase())) {
              notes.push(
                `note: dropped credential header "${name}" on cross-origin redirect to ${hopUrl.origin}.`
              )
              delete headers[name]
            }
          }
        }
        const cookieHeader = mergeCookiePairs(
          jar.headerFor(hopUrl),
          hop === 0 || hopUrl.origin === firstOrigin ? explicitCookies : []
        )
        for (const name of Object.keys(headers)) {
          if (name.toLowerCase() === 'cookie') delete headers[name]
        }
        if (cookieHeader) headers['Cookie'] = cookieHeader
        return headers
      }

      let currentUrl = url
      let currentMethod = method
      let currentBody = body

      for (let hop = 0; ; hop++) {
        if (!isTargetInScope(currentUrl.toString(), context.scope)) {
          throw new Error(`Target is outside authorized scope: ${currentUrl.toString()}.`)
        }
        const hopHeaders = buildHopHeaders(currentUrl, hop)
        assertHttpActionAllowed(
          {
            method: currentMethod,
            url: currentUrl.toString(),
            body: currentBody,
            headers: hopHeaders
          },
          { allowDestructive: context.allowDestructive }
        )

        let response: Response
        try {
          response = await fetch(currentUrl, {
            method: currentMethod,
            headers: hopHeaders,
            body: currentMethod === 'GET' || currentMethod === 'HEAD' ? undefined : currentBody,
            redirect: 'manual',
            signal
          })
        } catch (error) {
          if (
            error instanceof Error &&
            (error.name === 'TimeoutError' || error.name === 'AbortError')
          ) {
            throw new Error(
              context.signal.aborted
                ? 'http_request was aborted by the caller.'
                : `http_request timed out after ${timeoutMs}ms.`
            )
          }
          throw error
        }

        const setCookies = readSetCookieHeaders(response.headers)
        const cookieFlags = jar.storeFromResponse(currentUrl, setCookies)

        const location = response.headers.get('location')
        const isRedirect = response.status >= 300 && response.status < 400 && location !== null
        if (!isRedirect || !followRedirects) {
          if (isRedirect) redirectChain.push(hopLabel(response.status, currentUrl, location))
          return await respond({
            response,
            url: currentUrl,
            method: currentMethod,
            cookieFlags,
            writer,
            inlineBytes,
            saveResponse,
            durationMs: Date.now() - startedAt,
            redirectChain,
            following: followRedirects,
            notes
          })
        }

        redirectChain.push(hopLabel(response.status, currentUrl, location))
        // 重定向响应体没有证据价值，尽早释放连接。
        await response.arrayBuffer().catch(() => undefined)
        if (hop >= maxRedirects) {
          throw new Error(`http_request exceeded ${maxRedirects} redirect hops at ${location}.`)
        }
        const nextUrl = normalizeUrl(new URL(location, currentUrl).toString())
        // 303 一律转 GET；301/302 按惯例把 POST 降级为 GET；307/308 保留方法与 body。
        if (
          response.status === 303 ||
          ((response.status === 301 || response.status === 302) && currentMethod === 'POST')
        ) {
          currentMethod = 'GET'
          currentBody = undefined
        }
        currentUrl = nextUrl
      }
    }
  }
}

async function respond(input: {
  response: Response
  url: URL
  method: string
  cookieFlags: readonly CookieFlagObservation[]
  writer: ArtifactWriter
  inlineBytes: number
  saveResponse: boolean
  durationMs: number
  redirectChain: readonly string[]
  following: boolean
  notes: string[]
}): Promise<{ output: string; exitCode: number }> {
  const { response, url, method, cookieFlags, writer, inlineBytes, saveResponse } = input
  const notes = [...input.notes]

  // 逐条收集而非写入对象：多个 Set-Cookie 会以同名重复条目出现，写对象会丢掉前面的值。
  const headerEntries: Array<[string, string]> = []
  response.headers.forEach((value, key) => {
    headerEntries.push([key, value])
  })
  const headerPresence = new Set(headerEntries.map(([name]) => name.toLowerCase()))

  const { buffer: full, readTruncated } = await readCapped(response, MAX_READ_BYTES)
  const contentType = response.headers.get('content-type') ?? ''
  const textual = isTextualContentType(contentType)
  const binary = textual === false || hasBinaryBytes(full)

  if (readTruncated) {
    notes.push(
      `note: body read capped at ${MAX_READ_BYTES} bytes; the artifact holds a partial body.`
    )
  }
  notes.push(...describeCookieFlags(cookieFlags, url.protocol))
  notes.push(...describeMissingSecurityHeaders(headerPresence, url.protocol, response.status))

  let body: string
  if (binary) {
    const saved = saveResponse ? await writer.write(full, contentType, true) : undefined
    body = saved
      ? `(binary body omitted: ${full.byteLength} bytes, content-type: ${contentType || 'unknown'}; full body saved to ${saved} - use view/search_content on that path)`
      : `(binary body omitted: ${full.byteLength} bytes, content-type: ${contentType || 'unknown'})`
  } else {
    const preview = full.subarray(0, inlineBytes)
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(preview)
    if (full.byteLength > inlineBytes && saveResponse) {
      const saved = await writer.write(full, contentType, false)
      body = saved
        ? `${decoded}\n…(inline preview truncated at ${inlineBytes} bytes of ${full.byteLength}; full body saved to ${saved} - use view/search_content on that path)`
        : `${decoded}\n…(truncated at ${inlineBytes} bytes of ${full.byteLength}; full body could not be persisted)`
    } else if (full.byteLength > inlineBytes) {
      body = `${decoded}\n…(truncated at ${inlineBytes} bytes of ${full.byteLength})`
    } else {
      body = decoded
    }
  }

  return {
    output: formatEvidence({
      status: response.status,
      statusText: response.statusText,
      method,
      finalUrl: url.toString(),
      durationMs: input.durationMs,
      redirectChain: input.redirectChain,
      following: input.following,
      bodyBytes: full.byteLength,
      binary,
      notes: Array.from(new Set(notes)),
      headerEntries,
      body
    }),
    exitCode: response.status >= 200 && response.status < 400 ? 0 : 1
  }
}
