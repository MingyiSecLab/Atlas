/**
 * test_endpoint_variations: 批量测试端点变体与参数变种的可达性与鉴权边界 (active)。
 *
 * 安全工具域成员：实现 pentest 的 RuntimePentestTool 契约，由
 * pentest 域的 executor 与安全闸统一调度：
 * - 发起测试前对每一个待测端点经 isTargetInScope 逐一校验 scope
 * - 纯探测型 GET 请求，不执行有副作用的数据修改
 * - 限制单次测试端点数量上限（<= 25），防止流量洪泛
 */
import { isTargetInScope } from '../../pentest/scope.js'
import type { RuntimePentestTool } from '../../pentest/tools.js'

const MAX_ENDPOINTS = 25

const TEST_VARIATIONS_DESCRIPTION = [
  'Test multiple variations of an endpoint pattern or route to verify accessibility, status codes,',
  'and authorization boundaries. Arguments: endpoints (array of URLs or route paths),',
  'baseUrl (optional base URL to resolve relative paths, defaults to targetRef),',
  'sessionCookie (optional cookie string). Every resolved URL must be inside authorized scope.'
].join(' ')

function normalizeUrl(rawUrl: string, base?: string): URL {
  let url: URL
  try {
    url = base ? new URL(rawUrl, base) : new URL(rawUrl)
  } catch {
    throw new Error(`test_endpoint_variations requires valid URLs, got: ${rawUrl}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('test_endpoint_variations requires http or https URLs.')
  }
  url.username = ''
  url.password = ''
  url.hash = ''
  return url
}

export function createTestEndpointVariationsTool(): RuntimePentestTool {
  return {
    name: 'test_endpoint_variations',
    kind: 'active',
    description: TEST_VARIATIONS_DESCRIPTION,
    timeoutMs: 25_000,
    async execute(command, context) {
      const args = command.arguments ?? {}
      let rawEndpoints: string[] = []

      if (Array.isArray(args.endpoints)) {
        rawEndpoints = args.endpoints.filter((e): e is string => typeof e === 'string')
      } else if (typeof args.endpoints === 'string') {
        try {
          const parsed = JSON.parse(args.endpoints)
          if (Array.isArray(parsed)) {
            rawEndpoints = parsed.filter((e): e is string => typeof e === 'string')
          } else {
            rawEndpoints = [args.endpoints]
          }
        } catch {
          rawEndpoints = args.endpoints.split(',').map((s) => s.trim()).filter(Boolean)
        }
      }

      if (rawEndpoints.length === 0) {
        throw new Error('test_endpoint_variations requires at least one endpoint in arguments.endpoints.')
      }

      const endpointsToTest = rawEndpoints.slice(0, MAX_ENDPOINTS)
      const baseUrl =
        (typeof args.baseUrl === 'string' && args.baseUrl) || command.targetRef || undefined

      // Resolve and validate all URLs against scope before making requests
      const resolvedUrls: URL[] = []
      for (const endpoint of endpointsToTest) {
        const resolved = normalizeUrl(endpoint, baseUrl)
        if (!isTargetInScope(resolved.toString(), context.scope)) {
          throw new Error(`Target is outside authorized scope: ${resolved.toString()}`)
        }
        resolvedUrls.push(resolved)
      }

      const sessionCookie =
        typeof args.sessionCookie === 'string' && args.sessionCookie ? args.sessionCookie : undefined

      const results: Array<{
        endpoint: string
        status: number
        accessible: boolean
        contentLength: number
        error?: string
      }> = []

      const accessibleList: string[] = []
      const inaccessibleList: string[] = []

      for (const targetUrl of resolvedUrls) {
        const urlStr = targetUrl.toString()
        try {
          const reqHeaders: Record<string, string> = {
            'user-agent': 'mingyi-variations-probe/0.1'
          }
          if (sessionCookie) {
            reqHeaders.cookie = sessionCookie
          }

          const response = await fetch(urlStr, {
            method: 'GET',
            redirect: 'manual',
            headers: reqHeaders
          })

          const body = await response.arrayBuffer()
          const isAccessible = response.status >= 200 && response.status < 400

          results.push({
            endpoint: urlStr,
            status: response.status,
            accessible: isAccessible,
            contentLength: body.byteLength
          })

          if (isAccessible) {
            accessibleList.push(urlStr)
          } else {
            inaccessibleList.push(urlStr)
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          results.push({
            endpoint: urlStr,
            status: 0,
            accessible: false,
            contentLength: 0,
            error: msg
          })
          inaccessibleList.push(urlStr)
        }
      }

      const summary = {
        success: true,
        totalTested: results.length,
        accessibleCount: accessibleList.length,
        inaccessibleCount: inaccessibleList.length,
        accessibleEndpoints: accessibleList,
        results
      }

      return {
        output: JSON.stringify(summary, null, 2),
        exitCode: 0
      }
    }
  }
}
