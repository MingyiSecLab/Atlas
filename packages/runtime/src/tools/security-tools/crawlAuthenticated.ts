/**
 * crawl_authenticated_area: 递归爬取指定 URL 下的页面，收集链接、表单与潜在 API 端点 (active)。
 *
 * 安全工具域成员：实现 pentest 的 RuntimePentestTool 契约，由
 * pentest 域的 executor 与安全闸统一调度：
 * - 每个爬取目标（包括提取的链接、表单 action、重定向跳）在发起请求前逐 URL
 *   经 isTargetInScope 校验 scope
 * - 纯 HTTP 读取与正则模式提取，不执行不可信 JS
 * - 严格限制深度（maxDepth <= 4）与页面上限（maxPages <= 30），防止递归膨胀
 */
import { isTargetInScope } from '../../pentest/scope.js'
import type { RuntimePentestTool } from '../../pentest/tools.js'

const DEFAULT_MAX_DEPTH = 2
const MAX_ALLOWED_DEPTH = 4
const DEFAULT_MAX_PAGES = 15
const MAX_ALLOWED_PAGES = 30
const MAX_HTML_BYTES = 512 * 1024

const CRAWL_DESCRIPTION = [
  'Recursively crawl authenticated web pages starting from a URL to discover links, form actions,',
  'and embedded API endpoints. Arguments: url (or startUrl, defaults to targetRef),',
  'sessionCookie (optional cookie header), maxDepth (default 2, max 4), maxPages (default 15, max 30).',
  'Every fetched URL must remain inside the authorized scope.'
].join(' ')

function normalizeUrl(rawUrl: string, base?: string): URL | undefined {
  try {
    const url = base ? new URL(rawUrl, base) : new URL(rawUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    url.username = ''
    url.password = ''
    url.hash = ''
    return url
  } catch {
    return undefined
  }
}

const JS_PATTERNS: ReadonlyArray<RegExp> = [
  /\bfetch\s*\(\s*['"`]([^'"`]+)['"`]/g,
  /\.open\s*\(\s*['"][A-Z]+['"]\s*,\s*['"]([^'"]+)['"]/g,
  /\baxios(?:\.(?:get|post|put|patch|delete|request))?\s*\(\s*['"`]([^'"`]+)['"`]/g,
  /\$\.(?:ajax|get|post|getJSON)\s*\(\s*['"`]([^'"`]+)['"`]/g,
  /['"`](\/(?:api|v\d+)\/[A-Za-z0-9_\-./:${}]+)['"`]/g
]

export function createCrawlAuthenticatedTool(): RuntimePentestTool {
  return {
    name: 'crawl_authenticated_area',
    kind: 'active',
    description: CRAWL_DESCRIPTION,
    timeoutMs: 30_000,
    async execute(command, context) {
      const args = command.arguments ?? {}
      const rawStartUrl =
        (typeof args.url === 'string' && args.url) ||
        (typeof args.startUrl === 'string' && args.startUrl) ||
        command.targetRef

      if (!rawStartUrl) {
        throw new Error('crawl_authenticated_area requires a valid starting URL.')
      }

      const initialUrl = normalizeUrl(rawStartUrl)
      if (!initialUrl) {
        throw new Error(`Invalid URL for crawl_authenticated_area: ${rawStartUrl}`)
      }

      if (!isTargetInScope(initialUrl.toString(), context.scope)) {
        throw new Error(`Starting URL is outside authorized scope: ${initialUrl.toString()}`)
      }

      const sessionCookie =
        typeof args.sessionCookie === 'string' && args.sessionCookie.length > 0
          ? args.sessionCookie
          : undefined

      const maxDepth = Math.min(
        Math.max(1, Number(args.maxDepth) || DEFAULT_MAX_DEPTH),
        MAX_ALLOWED_DEPTH
      )
      const maxPages = Math.min(
        Math.max(1, Number(args.maxPages) || DEFAULT_MAX_PAGES),
        MAX_ALLOWED_PAGES
      )

      const visited = new Set<string>()
      const queue: Array<{ url: string; depth: number }> = [
        { url: initialUrl.toString(), depth: 0 }
      ]

      const pages: Array<{
        url: string
        status: number
        links: string[]
        forms: string[]
        endpoints: string[]
      }> = []
      const discoveredEndpoints = new Set<string>()

      while (queue.length > 0 && visited.size < maxPages) {
        const item = queue.shift()
        if (!item) break
        const { url: currentUrlStr, depth } = item

        if (visited.has(currentUrlStr) || depth > maxDepth) continue
        visited.add(currentUrlStr)

        const currentUrl = normalizeUrl(currentUrlStr)
        if (!currentUrl || !isTargetInScope(currentUrl.toString(), context.scope)) {
          continue
        }

        try {
          const reqHeaders: Record<string, string> = {
            'user-agent': 'mingyi-crawl-authenticated/0.1'
          }
          if (sessionCookie) {
            reqHeaders.cookie = sessionCookie
          }

          const response = await fetch(currentUrl.toString(), {
            method: 'GET',
            redirect: 'manual',
            headers: reqHeaders
          })

          const status = response.status
          const pageLinks: string[] = []
          const pageForms: string[] = []
          const pageEndpoints: string[] = []

          // Handle redirect
          if (status >= 300 && status < 400) {
            const loc = response.headers.get('location')
            if (loc) {
              const redirectUrl = normalizeUrl(loc, currentUrl.toString())
              if (
                redirectUrl &&
                isTargetInScope(redirectUrl.toString(), context.scope) &&
                !visited.has(redirectUrl.toString()) &&
                depth + 1 <= maxDepth
              ) {
                queue.push({ url: redirectUrl.toString(), depth: depth + 1 })
              }
            }
          }

          if (status >= 200 && status < 400) {
            const buffer = await response.arrayBuffer()
            const html = new TextDecoder('utf-8', { fatal: false }).decode(
              buffer.slice(0, MAX_HTML_BYTES)
            )

            // Extract links <a href="...">
            const linkRegex = /<a\b[^>]*?\bhref=["']([^"']+)["'][^>]*>/gi
            for (const match of html.matchAll(linkRegex)) {
              const href = match[1]?.trim()
              if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue
              const resolved = normalizeUrl(href, currentUrl.toString())
              if (resolved) {
                const targetStr = resolved.toString()
                if (!pageLinks.includes(targetStr)) {
                  pageLinks.push(targetStr)
                }
                if (
                  isTargetInScope(targetStr, context.scope) &&
                  !visited.has(targetStr) &&
                  depth + 1 <= maxDepth
                ) {
                  queue.push({ url: targetStr, depth: depth + 1 })
                }
              }
            }

            // Extract forms <form action="...">
            const formRegex = /<form\b[^>]*?\baction=["']([^"']+)["'][^>]*>/gi
            for (const match of html.matchAll(formRegex)) {
              const action = match[1]?.trim()
              if (!action) continue
              const resolved = normalizeUrl(action, currentUrl.toString())
              const formAction = resolved ? resolved.toString() : action
              if (!pageForms.includes(formAction)) {
                pageForms.push(formAction)
              }
            }

            // Extract JS endpoints
            for (const pattern of JS_PATTERNS) {
              pattern.lastIndex = 0
              for (const match of html.matchAll(pattern)) {
                const candidate = match[1]?.trim()
                if (!candidate || candidate.startsWith('#') || candidate.startsWith('javascript:')) {
                  continue
                }
                pageEndpoints.push(candidate)
                discoveredEndpoints.add(candidate)
              }
            }
          }

          pages.push({
            url: currentUrlStr,
            status,
            links: pageLinks,
            forms: pageForms,
            endpoints: Array.from(new Set(pageEndpoints))
          })
        } catch {
          pages.push({
            url: currentUrlStr,
            status: 0,
            links: [],
            forms: [],
            endpoints: []
          })
        }
      }

      const outputData = {
        success: true,
        startUrl: initialUrl.toString(),
        totalVisited: visited.size,
        pages,
        discoveredEndpoints: Array.from(discoveredEndpoints)
      }

      return {
        output: JSON.stringify(outputData, null, 2),
        exitCode: 0
      }
    }
  }
}
