/**
 * validate_discovery_completeness: 侦察完成度自检与置信打分 (read-only)。
 *
 * 安全工具域成员：实现 pentest 的 RuntimePentestTool 契约，由
 * pentest 域的 executor 与安全闸统一调度：
 * - 纯确定性规则函数，无网络、无文件 IO、无副作用
 * - 在生成最终报告/进入验证链之前作为质量闸：识别凭据未利用、JS 分析缺失、
 *   CRUD 未枚举、端点覆盖不足四类缺口，输出置信分与缺口清单
 */
import type { RuntimePentestTool } from '../../pentest/tools.js'

const VALIDATE_DISCOVERY_DESCRIPTION = [
  'Check discovery completeness before verification and reporting: computes a confidence score',
  'and lists gaps such as unused credentials, missing JavaScript analysis on authenticated pages,',
  'untested CRUD resource patterns, or too few endpoints.',
  'Arguments: discoveredEndpoints (string array), authenticatedWithCredentials (boolean),',
  'pagesWithJSAnalyzed (string array), credentialsFound (boolean).'
].join(' ')

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string')
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is string => typeof entry === 'string')
      }
    } catch {
      // 非法 JSON 时回退为逗号分隔列表
    }
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  return []
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true'
  return false
}

export function createValidateDiscoveryTool(): RuntimePentestTool {
  return {
    name: 'validate_discovery_completeness',
    kind: 'read-only',
    description: VALIDATE_DISCOVERY_DESCRIPTION,
    async execute(command) {
      const args = command.arguments ?? {}
      const discoveredEndpoints = parseStringList(args.discoveredEndpoints)
      const pagesWithJSAnalyzed = parseStringList(args.pagesWithJSAnalyzed)
      const authenticatedWithCredentials = parseBoolean(args.authenticatedWithCredentials)
      const credentialsFound = parseBoolean(args.credentialsFound)

      const gaps: Array<{ gap: string; severity: string; recommendation: string }> = []
      let confidence = 100

      // 凭据已发现但从未用于认证
      if (credentialsFound && !authenticatedWithCredentials) {
        gaps.push({
          gap: 'Credentials found but never used for authentication',
          severity: 'CRITICAL',
          recommendation:
            'Use the discovered credentials to authenticate, then use crawl_authenticated to explore authenticated sections'
        })
        confidence -= 40
      }

      // 已认证但未对认证后页面做过 JS 分析
      if (authenticatedWithCredentials && pagesWithJSAnalyzed.length === 0) {
        gaps.push({
          gap: 'Authenticated but no JavaScript analysis performed',
          severity: 'CRITICAL',
          recommendation:
            'Use extract_js_endpoints on authenticated pages such as /dashboard and /orders'
        })
        confidence -= 30
      }

      // 发现 {id} 资源模式但未枚举 CRUD 变体
      const hasResourcePatterns = discoveredEndpoints.some((endpoint) => endpoint.includes('{id}'))
      const hasCrudEnumeration = discoveredEndpoints.some(
        (endpoint) => endpoint.includes('receipt') || endpoint.includes('archive')
      )
      if (hasResourcePatterns && !hasCrudEnumeration) {
        gaps.push({
          gap: 'Resource patterns found but CRUD operations not enumerated',
          severity: 'HIGH',
          recommendation: 'Test all CRUD variations (receipt, archive, delete, edit, etc.)'
        })
        confidence -= 20
      }

      // 端点数量过少
      if (discoveredEndpoints.length < 5) {
        gaps.push({
          gap: 'Very few endpoints discovered (less than 5)',
          severity: 'MEDIUM',
          recommendation:
            'Ensure you crawled authenticated areas, analyzed JavaScript, and tested common paths'
        })
        confidence -= 10
      }

      const complete = confidence >= 90

      return {
        output: JSON.stringify(
          {
            complete,
            confidence,
            gaps,
            summary: complete
              ? `Discovery is ${confidence}% complete. Ready to generate final report.`
              : `Discovery is only ${confidence}% complete. ${gaps.length} critical gaps found.`,
            readyForReport: complete,
            message: complete
              ? 'Validation passed. Ready to proceed to verification and record_pentest_finding.'
              : `Validation failed. Address these gaps before reporting: ${gaps
                  .map((gap) => gap.gap)
                  .join('; ')}`
          },
          null,
          2
        ),
        exitCode: 0
      }
    }
  }
}
