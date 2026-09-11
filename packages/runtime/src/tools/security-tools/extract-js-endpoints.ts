/**
 * extract_js_endpoints：从页面与其引用的 JS 资产中提取 API 端点（active）。
 *
 * 安全工具域的成员：实现 pentest 的 RuntimePentestTool 契约，由
 * pentest 域的 executor 与安全闸统一调度（见 ADR-0003）：
 * - executor 只校验 command.targetRef；页面本身、每个外部 JS 资产与重定向
 *   的每一跳在这里用 isTargetInScope 逐个把关——JS 引用的第三方资源不在
 *   targetRef 的覆盖范围内，必须逐 URL 前置检查
 * - 只做 GET 读取与正则匹配：不执行 JS、不渲染页面，因此没有破坏性操作面，
 *   无需 destructive-guard；sessionCookie 仅随页面首跳发送（重定向跳转与
 *   第三方资产一律不带凭据）
 * - 原实现依赖 specialized/attackSurface/jsExtraction 与浏览器会话环境，
 *   本仓库没有对应能力，提取逻辑以纯函数在本文件重建
 */
import { isTargetInScope } from '../../pentest/scope.js'
import type { RuntimePentestTool } from '../../pentest/tools.js'

const MAX_SOURCE_BYTES = 512 * 1024
const MAX_REDIRECTS = 3
const DEFAULT_MAX_ASSETS = 10
const MAX_ASSETS = 25
const TOTAL_BUDGET_MS = 15_000

const EXTRACT_JS_ENDPOINTS_DESCRIPTION = [
  'Extract API endpoint URLs from a page and its external JavaScript assets using pattern matching.',
  'Arguments: url (optional, defaults to targetRef), sessionCookie (optional, sent only to the page origin),',
  'includeExternal (default true, download and analyze <script src> JS assets), maxAssets (default 10, cap 25).',
  'Patterns cover fetch(), XMLHttpRequest.open(), axios calls, jQuery ajax/get/post/getJSON, URL assignments',
  '(href/src/action/url) and literal /api/ or /vN/ path strings. Every fetched URL — page, asset, redirect hop —',
  'must stay inside the authorized scope. No JavaScript is executed; output is a deduplicated endpoint list.'
].join(' ')

function stringArgument(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function normalizeUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(`extract_js_endpoints requires a valid URL, got: ${rawUrl}.`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('extract_js_endpoints requires an http or https URL.')
  }
  url.username = ''
  url.password = ''
  url.hash = ''
  return url
}

function assertInScope(url: URL, scope: readonly string[]): void {
  if (!isTargetInScope(url.toString(), scope)) {
    throw new Error(`Target is outside authorized scope: ${url.toString()}.`)
  }
}

/** 常见前端请求形态 → 端点捕获组。顺序即输出优先级。 */
const JS_PATTERNS: ReadonlyArray<{ kind: string; pattern: RegExp }> = [
  { kind: 'fetch', pattern: /\bfetch\s*\(\s*['"`]([^'"`]+)['"`]/g },
  { kind: 'xhr', pattern: /\.open\s*\(\s*['"][A-Z]+['"]\s*,\s*['"]([^'"]+)['"]/g },
  {
    kind: 'axios',
    pattern: /\baxios(?:\.(?:get|post|put|patch|delete|request))?\s*\(\s*['"`]([^'"`]+)['"`]/g
  },
  { kind: 'jquery', pattern: /\$\.(?:ajax|get|post|getJSON)\s*\(\s*['"`]([^'"`]+)['"`]/g },
  { kind: 'assign', pattern: /\b(?:href|src|action|url)\s*=\s*['"`]([^'"`]+)['"`]/g },
  { kind: 'path', pattern: /['"`](\/(?:api|v\d+)\/[A-Za-z0-9_\-./:${}]+)['"`]/g }
]

const SKIP_VALUE_PATTERN = /^(?:javascript:|data:|mailto:|tel:|about:|#)/i

interface FetchedSource {
  url: URL
  status: number
  contentType: string
  body: string
}

function extractScriptSources(source: string, baseUrl: URL): URL[] {
  const sources: URL[] = []
  const pattern = /<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi
  for (const match of source.matchAll(pattern)) {
    try {
      const resolved = new URL(match[1] ?? '', baseUrl)
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
        sources.push(normalizeUrl(resolved.toString()))
      }
    } catch {
      // 无法解析的 src 保持忽略
    }
  }
  return sources
}

function discoverEndpoints(
  source: string,
  baseUrl: URL,
  exclude: ReadonlySet<string>
): Map<string, string> {
  const endpoints = new Map<string, string>()
  for (const { kind, pattern } of JS_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const raw = (match[1] ?? '').trim()
      if (!raw || SKIP_VALUE_PATTERN.test(raw)) continue
      let resolved: URL
      try {
        resolved = new URL(raw, baseUrl)
      } catch {
        continue
      }
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue
      const key = resolved.toString()
      if (exclude.has(key) || endpoints.has(key)) continue
      endpoints.set(key, kind)
    }
  }
  return endpoints
}

async function collectSource(url: URL, response: Response): Promise<FetchedSource> {
  const buffer = await response.arrayBuffer()
  const truncated = buffer.byteLength > MAX_SOURCE_BYTES
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, MAX_SOURCE_BYTES))
  return {
    url,
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    body: truncated ? `${decoded}\n…(truncated at ${MAX_SOURCE_BYTES} bytes)` : decoded
  }
}

async function fetchInScope(
  target: URL,
  options: { cookie?: string; signal: AbortSignal; scope: readonly string[] }
): Promise<FetchedSource> {
  let current = target
  for (let hop = 0; ; hop++) {
    assertInScope(current, options.scope)
    // 凭据只随页面首跳；重定向跳转与第三方 JS 资产一律不带 Cookie
    const headers: Record<string, string> =
      hop === 0 && options.cookie ? { cookie: options.cookie } : {}
    let response: Response
    try {
      response = await fetch(current, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: options.signal
      })
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new Error(
          options.signal.aborted
            ? 'extract_js_endpoints was aborted by the caller.'
            : `extract_js_endpoints timed out after ${TOTAL_BUDGET_MS}ms.`
        )
      }
      throw error
    }
    const location = response.headers.get('location')
    const isRedirect = response.status >= 300 && response.status < 400 && location !== null
    if (!isRedirect) return collectSource(current, response)
    // 响应体在重定向下没有证据价值，尽早释放连接
    await response.arrayBuffer().catch(() => undefined)
    if (hop >= MAX_REDIRECTS) {
      throw new Error(`extract_js_endpoints exceeded ${MAX_REDIRECTS} redirect hops at ${location}.`)
    }
    current = normalizeUrl(new URL(location ?? '', current).toString())
  }
}

export function createExtractJsEndpointsTool(): RuntimePentestTool {
  return {
    name: 'extract_js_endpoints',
    kind: 'active',
    description: EXTRACT_JS_ENDPOINTS_DESCRIPTION,
    timeoutMs: 30_000,
    async execute(command, context) {
      const args = command.arguments
      const rawUrl = stringArgument(args.url) ?? command.targetRef
      const sessionCookie = stringArgument(args.sessionCookie)
      const includeExternal = args.includeExternal !== false && args.includeExternal !== 'false'
      const requestedAssets = Number(args.maxAssets)
      const maxAssets = Number.isFinite(requestedAssets) && requestedAssets > 0
        ? Math.min(Math.floor(requestedAssets), MAX_ASSETS)
        : DEFAULT_MAX_ASSETS

      const pageUrl = normalizeUrl(rawUrl)
      // 覆盖整次抓取预算（页面 + 资产）的单次超时；executor 的 withToolTimeout 之外再兜一层
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(TOTAL_BUDGET_MS)])

      const page = await fetchInScope(pageUrl, { cookie: sessionCookie, signal, scope: context.scope })
      const lines: string[] = [`page: ${page.url.toString()} (status ${page.status})`]

      const assetUrls = includeExternal
        ? extractScriptSources(page.body, page.url).slice(0, maxAssets)
        : []
      const exclude = new Set(assetUrls.map((assetUrl) => assetUrl.toString()))
      const endpoints = discoverEndpoints(page.body, page.url, exclude)

      let analyzedAssets = 0
      for (const assetUrl of assetUrls) {
        const asset = await fetchInScope(assetUrl, { signal, scope: context.scope })
        if (asset.body.length === 0) continue
        // content-type 缺失时才按 .js 扩展名兜底；服务器显式声明非 JS 时遵从声明
        const isJs = asset.contentType.toLowerCase().includes('javascript')
        const fallbackJs = asset.contentType === '' && asset.url.pathname.toLowerCase().endsWith('.js')
        if (!isJs && !fallbackJs) continue
        analyzedAssets++
        lines.push(`asset: ${asset.url.toString()} (status ${asset.status})`)
        for (const [endpoint, kind] of discoverEndpoints(asset.body, asset.url, new Set())) {
          if (!endpoints.has(endpoint)) endpoints.set(endpoint, kind)
        }
      }

      lines.splice(1, 0, `analyzed: 1 page + ${analyzedAssets} js assets (${assetUrls.length} referenced)`)
      for (const [endpoint, kind] of [...endpoints.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        lines.push(`[${kind}] ${endpoint}`)
      }
      if (endpoints.size === 0) lines.push('no endpoints discovered')

      return {
        output: [`endpoints (${endpoints.size}):`, ...lines].join('\n'),
        exitCode: endpoints.size > 0 ? 0 : 1
      }
    }
  }
}
