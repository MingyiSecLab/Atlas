/**
 * document_endpoint: 记录攻击面分析中发现的具体端点与风险评估 (read-only 观测记录)。
 *
 * 安全工具域成员：实现 pentest 的 RuntimePentestTool 契约，由
 * pentest 域的 executor 与安全闸统一调度：
 * - 纯本地端点资产归档与黑盒风险打分，无主动发包，不具破坏性
 * - 产物持久化于工作区 .agents/pentest/endpoints/<appName>/ 目录
 * - 严格防路径逃逸（path traversal 拦截），保障只写在当前工作区内
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import type { RuntimePentestTool } from '../../pentest/tools.js'
import { resolvePentestArtifactsRoot } from './documentApp.js'

const DOCUMENT_ENDPOINT_DESCRIPTION = [
  'Document a discovered endpoint during attack surface reconnaissance into the workspace pentest artifact repository.',
  'Arguments: appName (required), routePath (required, e.g. /api/users), endpointType (api-endpoint|web-endpoint|asset),',
  'description (required), method (optional string or array), authRequired (optional boolean),',
  'riskLevel (optional LOW|MEDIUM|HIGH|CRITICAL), notes (optional).'
].join(' ')

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-_.]/g, '_')
}

function computeBlackboxRiskScore(
  riskLevel: string,
  routePath: string,
  authRequired?: boolean,
  method?: string | string[]
): number {
  let base = 50
  const normalizedLevel = riskLevel.toUpperCase()
  if (normalizedLevel.includes('CRITICAL')) base = 90
  else if (normalizedLevel.includes('HIGH')) base = 75
  else if (normalizedLevel.includes('LOW')) base = 25

  let modifier = 0
  const lowerPath = routePath.toLowerCase()

  // Sensitive keyword indicators
  if (/admin|manage|root|system|superuser/i.test(lowerPath)) modifier += 10
  if (/auth|login|token|jwt|oauth|session|passwd|password|credential/i.test(lowerPath)) modifier += 10
  if (/upload|file|download|export|backup|dump/i.test(lowerPath)) modifier += 10
  if (/exec|eval|cmd|shell|run|query|graphql/i.test(lowerPath)) modifier += 10

  // High risk methods
  const methods = Array.isArray(method) ? method.map((m) => m.toUpperCase()) : [String(method ?? '').toUpperCase()]
  if (methods.includes('DELETE') || methods.includes('PUT') || methods.includes('PATCH')) modifier += 5

  // Unauthenticated exposure on sensitive route
  if (authRequired === false && modifier > 0) modifier += 10

  return Math.min(100, Math.max(0, base + modifier))
}

export function createDocumentEndpointTool(): RuntimePentestTool {
  return {
    name: 'document_endpoint',
    kind: 'read-only',
    description: DOCUMENT_ENDPOINT_DESCRIPTION,
    async execute(command, context) {
      const args = command.arguments ?? {}
      const appName = typeof args.appName === 'string' ? args.appName.trim() : ''
      if (!appName) {
        throw new Error('document_endpoint requires a non-empty appName.')
      }

      let routePath = typeof args.routePath === 'string' ? args.routePath.trim() : ''
      if (!routePath) {
        throw new Error('document_endpoint requires a non-empty routePath.')
      }

      // If user passed a full URL, strip origin to keep routePath clean
      if (routePath.startsWith('http://') || routePath.startsWith('https://')) {
        try {
          const parsed = new URL(routePath)
          routePath = parsed.pathname + parsed.search
        } catch {
          // keep as is
        }
      }

      const endpointType =
        typeof args.endpointType === 'string' && args.endpointType
          ? args.endpointType
          : 'api-endpoint'
      const description = typeof args.description === 'string' ? args.description : ''
      const method = Array.isArray(args.method)
        ? (args.method.filter((m): m is string => typeof m === 'string'))
        : typeof args.method === 'string'
          ? args.method
          : undefined
      const authRequired =
        typeof args.authRequired === 'boolean' ? args.authRequired : undefined
      const authentication =
        typeof args.authentication === 'string' ? args.authentication : undefined
      const riskLevel =
        typeof args.riskLevel === 'string' && args.riskLevel ? args.riskLevel : 'MEDIUM'
      const notes = typeof args.notes === 'string' ? args.notes : undefined
      const transport = typeof args.transport === 'string' ? args.transport : 'http'

      const riskScore = computeBlackboxRiskScore(riskLevel, routePath, authRequired, method)

      const root = resolvePentestArtifactsRoot(context)
      const targetDir = resolve(root, '.agents', 'pentest', 'endpoints', sanitizeName(appName))
      if (targetDir !== root && !targetDir.startsWith(root + sep)) {
        throw new Error('Endpoint directory escapes the workspace root.')
      }

      await mkdir(targetDir, { recursive: true })

      const sanitizedPath = sanitizeName(routePath)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `asset_${sanitizedPath}_${timestamp}.json`
      const filepath = resolve(targetDir, filename)
      if (filepath !== root && !filepath.startsWith(root + sep)) {
        throw new Error('Endpoint record path escapes the workspace root.')
      }

      const record = {
        appName,
        routePath,
        endpointType,
        transport,
        description,
        method,
        authRequired,
        authentication,
        riskLevel,
        riskScore,
        notes,
        targetRef: command.targetRef,
        discoveredAt: new Date().toISOString()
      }

      await writeFile(filepath, JSON.stringify(record, null, 2), 'utf-8')

      return {
        output: JSON.stringify({
          success: true,
          appName,
          routePath,
          endpointType,
          riskLevel,
          riskScore,
          filepath,
          message: `Endpoint '${routePath}' documented successfully under app '${appName}'.`
        }, null, 2),
        exitCode: 0
      }
    }
  }
}
