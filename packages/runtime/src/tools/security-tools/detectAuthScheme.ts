/**
 * detect_auth_scheme: 分析目标端点以识别其认证机制与防护屏障 (active)。
 *
 * 安全工具域成员：实现 pentest 的 RuntimePentestTool 契约，由
 * pentest 域的 executor 与安全闸统一调度：
 * - 发起探测前经 isTargetInScope 校验 scope
 * - 纯观测型 HTTP GET 请求，不发起暴力破解，不携带敏感数据
 * - 识别 Basic / Bearer / 表单登录 / OAuth / JSON API 鉴权，以及 CAPTCHA / 频控屏障
 */
import { isTargetInScope } from '../../pentest/scope.js'
import type { RuntimePentestTool } from '../../pentest/tools.js'

const MAX_BODY_BYTES = 128 * 1024

const DETECT_AUTH_DESCRIPTION = [
  'Analyze an endpoint to detect authentication schemes (Basic, Bearer, HTML form, JSON API, OAuth)',
  'and identify barriers such as CAPTCHA or rate limiting.',
  'Arguments: url (or endpoint, defaults to targetRef). Target must remain inside authorized scope.'
].join(' ')

function normalizeUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(`detect_auth_scheme requires a valid URL, got: ${rawUrl}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('detect_auth_scheme requires an http or https URL.')
  }
  url.username = ''
  url.password = ''
  url.hash = ''
  return url
}

function detectBarrier(
  bodyLower: string,
  statusCode: number
): { type: string; details: string } | null {
  if (
    bodyLower.includes('captcha') ||
    bodyLower.includes('recaptcha') ||
    bodyLower.includes('hcaptcha') ||
    bodyLower.includes('g-recaptcha') ||
    bodyLower.includes('cf-turnstile') ||
    bodyLower.includes('turnstile')
  ) {
    return { type: 'captcha', details: 'CAPTCHA barrier detected on page.' }
  }

  if (
    statusCode === 429 ||
    bodyLower.includes('rate limit') ||
    bodyLower.includes('too many requests')
  ) {
    return { type: 'rate_limit', details: 'Rate limiting or throttling detected.' }
  }

  return null
}

export function createDetectAuthSchemeTool(): RuntimePentestTool {
  return {
    name: 'detect_auth_scheme',
    kind: 'active',
    description: DETECT_AUTH_DESCRIPTION,
    timeoutMs: 15_000,
    async execute(command, context) {
      const args = command.arguments ?? {}
      const rawUrl =
        (typeof args.url === 'string' && args.url) ||
        (typeof args.endpoint === 'string' && args.endpoint) ||
        command.targetRef

      if (!rawUrl) {
        throw new Error('detect_auth_scheme requires a valid endpoint URL.')
      }

      const targetUrl = normalizeUrl(rawUrl)
      if (!isTargetInScope(targetUrl.toString(), context.scope)) {
        throw new Error(`Target is outside authorized scope: ${targetUrl.toString()}`)
      }

      const response = await fetch(targetUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: { 'user-agent': 'mingyi-auth-detector/0.1' }
      })

      const buffer = await response.arrayBuffer()
      const body = new TextDecoder('utf-8', { fatal: false }).decode(
        buffer.slice(0, MAX_BODY_BYTES)
      )
      const bodyLower = body.toLowerCase()

      const barrier = detectBarrier(bodyLower, response.status)

      // 1. WWW-Authenticate header
      const wwwAuth = response.headers.get('www-authenticate')
      if (wwwAuth) {
        const lowerAuth = wwwAuth.toLowerCase()
        if (lowerAuth.includes('basic')) {
          return {
            output: JSON.stringify({
              success: true,
              endpoint: targetUrl.toString(),
              status: response.status,
              scheme: { method: 'basic', header: wwwAuth },
              barrier
            }, null, 2),
            exitCode: 0
          }
        }
        if (lowerAuth.includes('bearer')) {
          return {
            output: JSON.stringify({
              success: true,
              endpoint: targetUrl.toString(),
              status: response.status,
              scheme: { method: 'bearer', header: wwwAuth },
              barrier
            }, null, 2),
            exitCode: 0
          }
        }
      }

      // 2. Redirect to login
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location') || ''
        if (/login|signin|auth|oauth/i.test(location)) {
          return {
            output: JSON.stringify({
              success: true,
              endpoint: targetUrl.toString(),
              status: response.status,
              scheme: {
                method: 'redirect_form',
                loginLocation: location,
                browserRequired: true
              },
              barrier
            }, null, 2),
            exitCode: 0
          }
        }
      }

      // 3. HTML login form
      if (
        bodyLower.includes('type="password"') ||
        bodyLower.includes("type='password'")
      ) {
        const fields: Record<string, string> = {}
        const userMatch = body.match(
          /name=['"]?(username|user|email|login|user_name|account)['"]?/i
        )
        if (userMatch) fields.usernameField = userMatch[1] ?? ''

        const passMatch = body.match(/name=['"]?(password|pass|passwd|pwd)['"]?/i)
        if (passMatch) fields.passwordField = passMatch[1] ?? ''

        const csrfMatch = body.match(
          /name=['"]?(csrf|_csrf|csrfmiddlewaretoken|_token|authenticity_token)['"]?\s+value=['"]?([^'"]+)['"]?/i
        )
        const isSPA =
          bodyLower.includes('react') ||
          bodyLower.includes('vue') ||
          bodyLower.includes('angular') ||
          bodyLower.includes('__next')

        return {
          output: JSON.stringify({
            success: true,
            endpoint: targetUrl.toString(),
            status: response.status,
            scheme: {
              method: 'form',
              fields,
              csrfRequired: Boolean(csrfMatch),
              csrfToken: csrfMatch?.[2],
              browserRequired: isSPA
            },
            barrier
          }, null, 2),
          exitCode: 0
        }
      }

      // 4. JSON 401 / 403 API response
      if (response.status === 401 || response.status === 403) {
        return {
          output: JSON.stringify({
            success: true,
            endpoint: targetUrl.toString(),
            status: response.status,
            scheme: {
              method: 'json_api',
              status: response.status
            },
            barrier
          }, null, 2),
          exitCode: 0
        }
      }

      return {
        output: JSON.stringify({
          success: true,
          endpoint: targetUrl.toString(),
          status: response.status,
          scheme: null,
          message: `No explicit authentication scheme detected at ${targetUrl.toString()}`,
          barrier
        }, null, 2),
        exitCode: 0
      }
    }
  }
}
