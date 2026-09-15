/**
 * document_app: 记录安全侦察阶段发现的应用实体与技术栈信息 (read-only 观测记录)。
 *
 * 安全工具域成员：实现 pentest 的 RuntimePentestTool 契约，由
 * pentest 域的 executor 与安全闸统一调度：
 * - 纯本地侦察记录归档，无主动外网发包，不具破坏性
 * - 产物持久化于工作区 .agents/pentest/apps/ 目录
 * - 严格防路径逃逸（path traversal 拦截），保障只写在当前工作区内
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import type { RuntimePentestTool } from '../../pentest/tools.js'
import { sanitizeSessionDirName } from './kali-sandbox.js'

const DOCUMENT_APP_DESCRIPTION = [
  'Document an identified application asset (web application, API service, cloud resource, admin panel)',
  'discovered during reconnaissance into the workspace pentest artifact repository.',
  'Arguments: appName (required), appType (web_application|api|full_stack|database|cloud_resource|storage),',
  'description (required), framework (optional), technology (optional string array),',
  'authentication (optional), domain (optional base URL with scheme), notes (optional).'
].join(' ')

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-_.]/g, '_')
}

/**
 * 解析 Pentest 资产产物持久化根目录。
 * 契约规则：
 * 1. 若当前会话关联了真实项目文件夹（用户在桌面端选择了文件夹项目），则存储在该工程的根目录下：`<projectRoot>/.agents/pentest/`
 * 2. 若当前会话未关联项目文件夹（普通独立对话），则存储在系统全局用户目录中，按会话 UUID 隔离：`~/.atlas/sessions/<sessionId>/.agents/pentest/`
 */
export function resolvePentestArtifactsRoot(context: { workspacePath: string; sessionId?: string }): string {
  const root = resolve(context.workspacePath)
  const isDefaultOrDevDir =
    root.includes('apps/desktop') ||
    root.endsWith('mingyi-tot') ||
    root.endsWith('.atlas') ||
    root.endsWith('.atlas/workspace')
  if (context.sessionId && isDefaultOrDevDir) {
    const atlasHome = process.env.MASTRA_APP_DATA_DIR || join(homedir(), '.atlas')
    return join(atlasHome, 'sessions', sanitizeSessionDirName(context.sessionId))
  }
  return root
}

export function createDocumentAppTool(): RuntimePentestTool {
  return {
    name: 'document_app',
    kind: 'read-only',
    description: DOCUMENT_APP_DESCRIPTION,
    async execute(command, context) {
      const args = command.arguments ?? {}
      const rawAppName = typeof args.appName === 'string' ? args.appName.trim() : ''
      if (!rawAppName) {
        throw new Error('document_app requires a non-empty appName.')
      }

      const appType =
        typeof args.appType === 'string' && args.appType ? args.appType : 'web_application'
      const description = typeof args.description === 'string' ? args.description : ''
      const framework = typeof args.framework === 'string' ? args.framework : undefined
      const technology = Array.isArray(args.technology)
        ? (args.technology.filter((t): t is string => typeof t === 'string'))
        : undefined
      const authentication =
        typeof args.authentication === 'string' ? args.authentication : undefined
      const notes = typeof args.notes === 'string' ? args.notes : undefined

      let domain = typeof args.domain === 'string' ? args.domain.trim() : undefined
      if (domain) {
        try {
          const parsed = new URL(domain)
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error('Invalid domain protocol')
          }
          domain = parsed.origin
        } catch {
          throw new Error(`document_app domain must be a valid http or https URL: ${domain}`)
        }
      }

      const root = resolvePentestArtifactsRoot(context)
      const appsDir = resolve(root, '.agents', 'pentest', 'apps')
      if (appsDir !== root && !appsDir.startsWith(root + sep)) {
        throw new Error('Apps directory escapes the workspace root.')
      }

      await mkdir(appsDir, { recursive: true })

      const filename = `${sanitizeName(rawAppName)}.json`
      const filepath = resolve(appsDir, filename)
      if (filepath !== root && !filepath.startsWith(root + sep)) {
        throw new Error('App record path escapes the workspace root.')
      }

      const record = {
        appName: rawAppName,
        appType,
        description,
        framework,
        technology,
        authentication,
        domain,
        notes,
        targetRef: command.targetRef,
        createdAt: new Date().toISOString()
      }

      await writeFile(filepath, JSON.stringify(record, null, 2), 'utf-8')

      return {
        output: JSON.stringify({
          success: true,
          appName: rawAppName,
          appType,
          filepath,
          message: `Application '${rawAppName}' documented successfully.`
        }, null, 2),
        exitCode: 0
      }
    }
  }
}
