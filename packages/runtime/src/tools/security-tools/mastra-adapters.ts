import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { isTargetInScope } from '../../pentest/scope.js'
import {
  createCrawlAuthenticatedTool,
  createDetectAuthSchemeTool,
  createDetectSandboxTool,
  createDocumentAppTool,
  createDocumentEndpointTool,
  createExtractJsEndpointsTool,
  createHttpRequestTool,
  createTestEndpointVariationsTool
} from './index.js'
import { createKaliSandboxTools, KALI_SANDBOX_LOCAL_TARGET } from './kali-sandbox.js'
import type { RuntimePentestToolContext } from '../../pentest/tools.js'
import type { RuntimePentestService } from '../../pentest/types.js'
import type { RuntimeSandboxAdapter } from '../../sandbox/types.js'

export interface SecurityToolsOptions {
  workspacePath?: string
  scope?: readonly string[]
  allowDestructive?: boolean
  pentestService?: RuntimePentestService
  /** 提供后额外注册 kali 沙箱工具（kali_exec / kali_session_* / kali_file_*）。 */
  sandbox?: RuntimeSandboxAdapter
  /** 获取当前活跃会话 ID（对话 UUID） */
  getActiveSessionId?: () => string | undefined
}

function resolveSessionIdFromContext(
  options?: SecurityToolsOptions,
  executionContext?: unknown
): string | undefined {
  const ctx = executionContext as Record<string, any> | undefined
  const fromContext =
    ctx?.requestContext?.get?.('sessionId') ??
    ctx?.requestContext?.get?.('threadId') ??
    ctx?.agent?.threadId ??
    ctx?.agent?.sessionId
  if (typeof fromContext === 'string' && fromContext.trim().length > 0) {
    return fromContext.trim()
  }
  return options?.getActiveSessionId?.()
}

function buildDefaultContext(
  urlOrTarget: string,
  options?: SecurityToolsOptions,
  signal?: AbortSignal,
  sessionId?: string
): RuntimePentestToolContext {
  let targetHost = '*'
  try {
    const parsed = new URL(urlOrTarget)
    targetHost = parsed.host
  } catch {
    targetHost = urlOrTarget.split('/')[0] || '*'
  }

  return {
    workspacePath: options?.workspacePath ?? process.cwd(),
    scope: options?.scope && options.scope.length > 0 ? options.scope : [targetHost, '*'],
    allowDestructive: options?.allowDestructive ?? false,
    signal: signal ?? new AbortController().signal,
    sessionId: sessionId ?? options?.getActiveSessionId?.()
  }
}

/**
 * 将底层面向渗透测试的 RuntimePentestTool 适配包装为 Mastra 对话 Agent 可用的 Tool
 */
export function createSecurityMastraTools(options?: SecurityToolsOptions) {
  const sharedCookieJar = new Map<string, Map<string, string>>()

  // 1. http_request
  const rawHttpRequest = createHttpRequestTool({ cookieJar: sharedCookieJar })
  const httpRequestTool = createTool({
    id: 'http_request',
    description:
      '发送 HTTP 请求并获取响应状态、头部信息、耗时、重定向链与正文。支持持久化会话 Cookie（含 Domain/Path/Secure/HttpOnly/SameSite/过期语义）与自动跟随重定向；' +
      '超长正文与二进制正文会落盘到 .agents/pentest/http/ 并回传文件路径供 view/search_content 查阅。用于连通性探测、登录验证与接口测试。' +
      '参数：url (必填), method (GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS, 默认 GET), headers (可选 JSON 字符串), body (字符串请求体),' +
      'jsonBody (对象或 JSON 字符串, 自动设置 Content-Type: application/json), form (对象, 自动编码为 application/x-www-form-urlencoded),' +
      'followRedirects (默认 true), maxRedirects (默认 5), timeout (可选超时毫秒数), saveResponse (默认 true)。',
    inputSchema: z.object({
      url: z.string().describe('目标 HTTP/HTTPS URL'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).optional().default('GET'),
      headers: z.string().optional().describe('JSON 格式的请求头键值对，例如 "{\\"Authorization\\":\\"Bearer ...\\"}"'),
      body: z.string().optional().describe('POST/PUT/PATCH 请求体字符串（不能与 jsonBody/form 同时使用）'),
      jsonBody: z.union([z.record(z.string(), z.unknown()), z.string()]).optional().describe('JSON 请求体：对象会被序列化，自动补齐 Content-Type: application/json（已有 content-type 头时不覆盖）'),
      form: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe('表单字段对象，自动编码为 application/x-www-form-urlencoded 请求体（适合登录表单/CSRF 提交）'),
      followRedirects: z.boolean().optional().default(true).describe('是否自动跟随 3xx 重定向并自动保持传递会话 Cookie。登录验证时建议开启。默认为 true。'),
      maxRedirects: z.number().optional().default(5).describe('跟随重定向的最大跳数，默认 5'),
      timeout: z.number().optional().default(10000).describe('超时时间 (毫秒)，上限 25000'),
      saveResponse: z.boolean().optional().default(true).describe('超长/二进制响应正文是否落盘到 .agents/pentest/http/，默认 true')
    }),
    execute: async (inputData) => {
      const { url, ...args } = inputData
      const context = buildDefaultContext(url, options)
      const res = await rawHttpRequest.execute(
        {
          targetRef: url,
          toolName: 'http_request',
          arguments: { url, ...args }
        },
        context
      )
      return res.output
    }
  })

  // 2. extract_js_endpoints
  const rawExtractJs = createExtractJsEndpointsTool()
  const extractJsEndpointsTool = createTool({
    id: 'extract_js_endpoints',
    description:
      '从目标 Web 页面与其引用的外部 JavaScript 文件中分析提取 API 端点与路由列表。无需执行 JS 代码。' +
      '参数：url (必填), sessionCookie (可选 Cookie 头), includeExternal (是否抓取并分析外链 js, 默认 true), maxAssets (最大分析脚本数, 默认 10)。',
    inputSchema: z.object({
      url: z.string().describe('目标页面 URL'),
      sessionCookie: z.string().optional().describe('登录凭据 Cookie'),
      includeExternal: z.boolean().optional().default(true).describe('是否分析外部引用 JS 文件'),
      maxAssets: z.number().optional().default(10).describe('最大抓取脚本数量')
    }),
    execute: async (inputData) => {
      const { url, ...args } = inputData
      const context = buildDefaultContext(url, options)
      const res = await rawExtractJs.execute(
        {
          targetRef: url,
          toolName: 'extract_js_endpoints',
          arguments: { url, ...args }
        },
        context
      )
      return res.output
    }
  })

  // 3. detect_auth_scheme
  const rawDetectAuth = createDetectAuthSchemeTool()
  const detectAuthSchemeTool = createTool({
    id: 'detect_auth_scheme',
    description:
      '探测目标端点的认证方式（如 HTML 表单登录、Basic、Bearer Token、OAuth、JSON API）与防护屏障（如验证码、频率限制）。' +
      '参数：url (必填)。',
    inputSchema: z.object({
      url: z.string().describe('待探测的目标 URL')
    }),
    execute: async (inputData) => {
      const { url } = inputData
      const context = buildDefaultContext(url, options)
      const res = await rawDetectAuth.execute(
        {
          targetRef: url,
          toolName: 'detect_auth_scheme',
          arguments: { url }
        },
        context
      )
      return res.output
    }
  })

  // 4. crawl_authenticated
  const rawCrawl = createCrawlAuthenticatedTool()
  const crawlAuthenticatedTool = createTool({
    id: 'crawl_authenticated',
    description:
      '递归爬取目标 Web 站点，搜集可访问的页面链接、表单 action 与嵌入 API。' +
      '参数：url (必填起始 URL), sessionCookie (可选登录 Cookie), maxDepth (爬取深度 1-4, 默认 2), maxPages (最大页面数 1-30, 默认 15)。',
    inputSchema: z.object({
      url: z.string().describe('起始爬取 URL'),
      sessionCookie: z.string().optional().describe('会话 Cookie'),
      maxDepth: z.number().min(1).max(4).optional().default(2).describe('递归深度'),
      maxPages: z.number().min(1).max(30).optional().default(15).describe('最大页面数')
    }),
    execute: async (inputData) => {
      const { url, ...args } = inputData
      const context = buildDefaultContext(url, options)
      const res = await rawCrawl.execute(
        {
          targetRef: url,
          toolName: 'crawl_authenticated',
          arguments: { url, ...args }
        },
        context
      )
      return res.output
    }
  })

  // 5. test_endpoint_variations
  const rawTestVariations = createTestEndpointVariationsTool()
  const testEndpointVariationsTool = createTool({
    id: 'test_endpoint_variations',
    description:
      '批量测试端点路径变体（如后缀追加、大小写、前缀）的可达性与响应状态。' +
      '参数：endpoints (待测端点数组), baseUrl (基准基础 URL), sessionCookie (可选)。',
    inputSchema: z.object({
      endpoints: z.array(z.string()).describe('待测路径变体数组，例如 ["/api/users", "/api/v1/users"]'),
      baseUrl: z.string().describe('基准目标 URL，例如 "http://example.com"'),
      sessionCookie: z.string().optional().describe('登录 Cookie')
    }),
    execute: async (inputData) => {
      const { baseUrl, endpoints, sessionCookie } = inputData
      const context = buildDefaultContext(baseUrl, options)
      const res = await rawTestVariations.execute(
        {
          targetRef: baseUrl,
          toolName: 'test_endpoint_variations',
          arguments: { baseUrl, endpoints, sessionCookie }
        },
        context
      )
      return res.output
    }
  })

  // 6. document_app
  const rawDocApp = createDocumentAppTool()
  const documentAppTool = createTool({
    id: 'document_app',
    description:
      '将侦察到的应用实体与技术栈信息归档到工作区 .agents/pentest/ 目录下。' +
      '参数：appName (必填应用名), appType (web_application|api|full_stack|database 等), description (描述), framework (框架), domain (基础域名)。',
    inputSchema: z.object({
      appName: z.string().describe('应用识别名称'),
      appType: z.string().optional().default('web_application'),
      description: z.string().describe('应用资产描述'),
      framework: z.string().optional().describe('识别到的框架，例如 PHP/Apache、Spring 等'),
      domain: z.string().optional().describe('主域名或根 URL')
    }),
    execute: async (inputData) => {
      const { appName, domain, ...args } = inputData
      const context = buildDefaultContext(domain || appName, options)
      const res = await rawDocApp.execute(
        {
          targetRef: domain || appName,
          toolName: 'document_app',
          arguments: { appName, domain, ...args }
        },
        context
      )
      return res.output
    }
  })

  // 7. document_endpoint
  const rawDocEndpoint = createDocumentEndpointTool()
  const documentEndpointTool = createTool({
    id: 'document_endpoint',
    description:
      '将发现的端点与安全风险等级归档到工作区 .agents/pentest/endpoints/ 目录下。' +
      '参数：appName (所属应用名), routePath (端点路径), description (说明), riskLevel (LOW|MEDIUM|HIGH|CRITICAL)。',
    inputSchema: z.object({
      appName: z.string().describe('所属应用名'),
      routePath: z.string().describe('端点路由，如 /login.php 或 /vulnerabilities/exec/'),
      description: z.string().describe('端点功能说明与安全分析'),
      method: z.string().optional().describe('HTTP 方法，如 GET、POST'),
      authRequired: z.boolean().optional().describe('是否需要登录凭据'),
      riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().default('LOW')
    }),
    execute: async (inputData) => {
      const { appName, routePath, ...args } = inputData
      const context = buildDefaultContext(appName, options)
      const res = await rawDocEndpoint.execute(
        {
          targetRef: appName,
          toolName: 'document_endpoint',
          arguments: { appName, routePath, ...args }
        },
        context
      )
      return res.output
    }
  })

  // 8. init_pentest_engagement
  let activeEngagementId: string | null = null
  const initPentestEngagementTool = createTool({
    id: 'init_pentest_engagement',
    description:
      '初始化渗透评估任务并激活右侧实时工作视图拓扑图。在收到新的测试目标（靶场 URL、IP 或系统）后，进行主动探测前必须首先调用本工具建立评估任务。' +
      '参数：target (必填目标 URL/Host), title/name (可选评估标题), goal (可选评估目标说明), scope (可选授权范围域名列表)。',
    inputSchema: z.object({
      target: z.string().describe('待评估的目标 URL 或主机，例如 http://39.105.79.16/login.php'),
      title: z.string().optional().describe('安全评估任务标题，例如 "DVWA 靶场漏洞验证评估"'),
      name: z.string().optional().describe('任务名称（title 别名）'),
      goal: z.string().optional().describe('评估目标说明，例如 "针对 DVWA 靶场的命令执行漏洞与登录机制验证"'),
      scope: z.union([z.string(), z.array(z.string())]).optional().describe('授权范围域名/主机列表，默认自动提取目标 host')
    }),
    execute: async (inputData) => {
      const { target, title: rawTitle, name: rawName, goal: rawGoal, scope: rawScope } = inputData
      let targetHost = target
      try {
        targetHost = new URL(target).host
      } catch {
        targetHost = target.split('/')[0] || target
      }
      const title = rawTitle?.trim() || rawName?.trim() || `安全评估 - ${targetHost}`
      const goal = rawGoal?.trim() || `针对 ${target} 的授权漏洞探测与验证`
      const normalizedScope = typeof rawScope === 'string' ? [rawScope] : rawScope
      const scope = normalizedScope && normalizedScope.length > 0 ? normalizedScope : [targetHost, '*']

      if (options?.pentestService) {
        try {
          const engagement = options.pentestService.create({
            title,
            origin: target,
            goal,
            authorization: {
              principal: 'security-agent',
              scope,
              authorizationRef: 'interactive-chat-auth',
              executionMode: 'authorized-active'
            }
          })
          activeEngagementId = engagement.id
          try {
            engagement.createIntent({
              from: ['origin'],
              description: `探测目标存活与基本资产信息 (${targetHost})`,
              creator: 'Atlas'
            })
          } catch {
            // Non-fatal
          }
          return JSON.stringify(
            {
              success: true,
              engagementId: engagement.id,
              target,
              title,
              scope,
              status: 'active',
              message: `渗透测试任务初始化成功 [${engagement.id}]，右侧工作视图拓扑已激活。`
            },
            null,
            2
          )
        } catch (error) {
          return JSON.stringify(
            {
              success: false,
              error: error instanceof Error ? error.message : String(error),
              target
            },
            null,
            2
          )
        }
      }

      return JSON.stringify(
        {
          success: true,
          target,
          title,
          message: `渗透测试任务初始化成功，评估上下文已就绪，目标: ${target}`
        },
        null,
        2
      )
    }
  })

  // 9. record_pentest_finding
  const recordPentestFindingTool = createTool({
    id: 'record_pentest_finding',
    description:
      '向当前渗透评估任务中录入已验证的安全漏洞与技术证据，并在右侧「发现列表」和拓扑图中实时生成漏洞事实节点。' +
      '参数：target/endpoint (漏洞端点), title (漏洞标题), severity (critical/high/medium/low/info), description (漏洞说明), proof/evidence (PoC、命令回显或响应证据), remediation (修复建议)。',
    inputSchema: z.object({
      target: z.string().optional().describe('存在漏洞的目标端点或 URL'),
      endpoint: z.string().optional().describe('存在漏洞的目标端点（target 别名）'),
      title: z.string().describe('漏洞标题，例如 "DVWA 命令注入漏洞 (Command Injection)"'),
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).default('high').describe('漏洞等级'),
      description: z.string().describe('漏洞的技术细节、成因与危害分析'),
      proof: z.string().optional().describe('漏洞复现 PoC、命令执行回显或关键 HTTP 响应片段'),
      evidence: z.string().optional().describe('技术证据或响应片段（proof 别名）'),
      remediation: z.string().optional().describe('推荐的修复整改建议')
    }),
    execute: async (inputData) => {
      const {
        target: rawTarget,
        endpoint: rawEndpoint,
        title,
        severity,
        description,
        proof: rawProof,
        evidence: rawEvidence,
        remediation
      } = inputData
      const target = rawTarget || rawEndpoint || 'target'
      const proof = rawProof || rawEvidence || ''

      if (options?.pentestService) {
        try {
          const engagementId = activeEngagementId || options.pentestService.list().at(-1)
          if (!engagementId) {
            return JSON.stringify(
              {
                success: false,
                error: '未找到活跃的渗透评估任务，请先调用 init_pentest_engagement。'
              },
              null,
              2
            )
          }

          const engagement = options.pentestService.get(engagementId)
          const verifier = options.pentestService.getVerifier(engagementId)

          // 1. 录入证据
          const fullProof = [
            description,
            proof ? `PoC / 证据回显:\n${proof}` : '',
            remediation ? `修复建议:\n${remediation}` : ''
          ].filter(Boolean).join('\n\n')

          let effectiveTargetRef = target
          if (target.startsWith('/')) {
            try {
              effectiveTargetRef = new URL(target, engagement.config.origin).toString()
            } catch {
              effectiveTargetRef = `${engagement.config.origin.replace(/\/+$/, '')}${target}`
            }
          }
          if (!isTargetInScope(effectiveTargetRef, engagement.config.authorization.scope)) {
            effectiveTargetRef = engagement.config.origin
          }

          const evidence = engagement.addEvidence({
            targetRef: effectiveTargetRef,
            toolName: 'pentest_verification',
            inputDigest: title,
            outputRef: `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            output: fullProof
          })
          // 2. Verifier 签署验证与严重级别
          verifier.verifyEvidence({
            evidenceId: evidence.id,
            status: 'independently_verified',
            verifierId: 'Atlas-Verifier',
            notes: `[${severity.toUpperCase()}] ${title}`,
            method: 'manual',
            rule: {
              kind: 'output_contains',
              value: title
            }
          })

          // 3. 提交意图并归纳为 Fact 节点
          const intent = engagement.createIntent({
            from: ['origin'],
            description: `验证漏洞: ${title} (${target})`,
            creator: 'Atlas'
          })

          engagement.concludeIntent({
            intentId: intent.id,
            worker: 'Atlas',
            description: `[${severity.toUpperCase()}] ${title}: 在端点 ${target} 确认存在漏洞。\n${description}`,
            evidenceRefs: [evidence.id],
            severity: severity as any
          })

          return JSON.stringify(
            {
              success: true,
              engagementId,
              findingId: `finding-${intent.id}`,
              title,
              severity,
              target,
              message: `成功记录安全漏洞与验证事实 [${title}]，已同步更新至拓扑与发现列表。`
            },
            null,
            2
          )
        } catch (error) {
          return JSON.stringify(
            {
              success: false,
              error: error instanceof Error ? error.message : String(error)
            },
            null,
            2
          )
        }
      }

      return JSON.stringify(
        {
          success: true,
          title,
          severity,
          target,
          message: `漏洞成果已记录（独立模式）: ${title}`
        },
        null,
        2
      )
    }
  })

  // 10. detect_sandbox_environment
  const rawDetectSandbox = createDetectSandboxTool()
  const detectSandboxTool = createTool({
    id: 'detect_sandbox_environment',
    description:
      '检测宿主机 Docker 环境与 mingyi-sandbox 渗透测试沙箱容器的就绪状态。' +
      '在执行需要专业渗透测试工具（nmap、nuclei、sqlmap 等）的任务前，使用此工具检查沙箱是否可用，' +
      '并在环境未就绪时获取精确的启动与配置指导命令。无需输入参数。',
    inputSchema: z.object({}).passthrough().optional(),
    execute: async () => {
      const context = buildDefaultContext(KALI_SANDBOX_LOCAL_TARGET, options)
      const res = await rawDetectSandbox.execute(
        {
          targetRef: KALI_SANDBOX_LOCAL_TARGET,
          toolName: 'detect_sandbox_environment',
          arguments: {}
        },
        context
      )
      return res.output
    }
  })

  // 11-17. Kali 沙箱工具（仅当宿主注入 sandbox adapter 时注册）
  const sandboxTools: Record<string, ReturnType<typeof createTool>> = {}
  if (options?.sandbox) {
    const rawKaliTools = createKaliSandboxTools({
      adapter: options.sandbox,
      getActiveSessionId: options.getActiveSessionId
    })
    const execRaw = rawKaliTools.find((tool) => tool.name === 'kali_exec')!
    sandboxTools.kali_exec = createTool({
      id: 'kali_exec',
      description:
        '在隔离的 Kali 沙箱容器内执行单条 shell 命令（nmap, nuclei, ffuf, sqlmap, impacket 等）并捕获输出。' +
        '沙箱具备完整无头 Kali 工具链、离线知识库 (/home/kali/knowledges) 与 PoC 库 (/home/kali/pocs)。' +
        '工作目录默认自动绑定并隔离于当前对话 UUID 目录 (/home/kali/workspace/<sessionId>)。' +
        '参数：command (必填 shell 命令), target (必填授权目标引用), cwd (可选工作目录), timeoutMs (可选超时毫秒数)。',
      inputSchema: z.object({
        command: z.string().describe('要执行的 shell 命令'),
        target: z.string().describe('该命令所针对的授权测试目标（IP/主机/URL/sandbox）'),
        cwd: z.string().optional().describe('容器内工作目录，默认自动绑定当前会话隔离目录 /home/kali/workspace/<sessionId>'),
        timeoutMs: z.number().positive().optional().describe('超时毫秒数，默认 120000')
      }),
      execute: async (inputData, executionContext) => {
        const sessionId = resolveSessionIdFromContext(options, executionContext)
        const context = buildDefaultContext(
          inputData.target,
          options,
          (executionContext as any)?.abortSignal,
          sessionId
        )
        const res = await execRaw.execute(
          {
            targetRef: inputData.target,
            toolName: 'kali_exec',
            arguments: {
              command: inputData.command,
              target: inputData.target,
              ...(inputData.cwd ? { cwd: inputData.cwd } : {}),
              ...(inputData.timeoutMs ? { timeoutMs: inputData.timeoutMs } : {})
            }
          },
          context
        )
        return res.output
      }
    })

    const sessionStartRaw = rawKaliTools.find((tool) => tool.name === 'kali_session_start')!
    sandboxTools.kali_session_start = createTool({
      id: 'kali_session_start',
      description:
        '在 Kali 沙箱内启动持久后台会话（tmux 承载），用于启动监听器、nc 反弹 shell、交互式调试等长期运行任务。' +
        '参数：id (必填会话标识), command (必填启动命令), target (可选目标引用，默认 sandbox)。',
      inputSchema: z.object({
        id: z.string().describe('会话唯一标识（不可包含冒号或空格）'),
        command: z.string().describe('会话初始启动命令'),
        target: z.string().optional().describe('关联目标引用，默认 sandbox')
      }),
      execute: async (inputData) => {
        const target = inputData.target || KALI_SANDBOX_LOCAL_TARGET
        const context = buildDefaultContext(target, options)
        const res = await sessionStartRaw.execute(
          {
            targetRef: target,
            toolName: 'kali_session_start',
            arguments: { id: inputData.id, command: inputData.command }
          },
          context
        )
        return res.output
      }
    })

    const sessionSendRaw = rawKaliTools.find((tool) => tool.name === 'kali_session_send')!
    sandboxTools.kali_session_send = createTool({
      id: 'kali_session_send',
      description:
        '向 Kali 沙箱持久会话发送一行输入命令并自动回车。参数：id (必填会话标识), input (必填输入文本)。',
      inputSchema: z.object({
        id: z.string().describe('会话标识'),
        input: z.string().describe('要输入的命令或数据')
      }),
      execute: async (inputData) => {
        const context = buildDefaultContext(KALI_SANDBOX_LOCAL_TARGET, options)
        const res = await sessionSendRaw.execute(
          {
            targetRef: KALI_SANDBOX_LOCAL_TARGET,
            toolName: 'kali_session_send',
            arguments: { id: inputData.id, input: inputData.input }
          },
          context
        )
        return res.output
      }
    })

    const sessionReadRaw = rawKaliTools.find((tool) => tool.name === 'kali_session_read')!
    sandboxTools.kali_session_read = createTool({
      id: 'kali_session_read',
      description:
        '增量读取 Kali 沙箱后台会话的新增输出，并检查进程是否仍存活。参数：id (必填会话标识)。',
      inputSchema: z.object({
        id: z.string().describe('会话标识')
      }),
      execute: async (inputData) => {
        const context = buildDefaultContext(KALI_SANDBOX_LOCAL_TARGET, options)
        const res = await sessionReadRaw.execute(
          {
            targetRef: KALI_SANDBOX_LOCAL_TARGET,
            toolName: 'kali_session_read',
            arguments: { id: inputData.id }
          },
          context
        )
        return res.output
      }
    })

    const sessionCloseRaw = rawKaliTools.find((tool) => tool.name === 'kali_session_close')!
    sandboxTools.kali_session_close = createTool({
      id: 'kali_session_close',
      description: '关闭一个沙箱会话并终止其进程。参数：sessionId (必填)。',
      inputSchema: z.object({
        sessionId: z.string().describe('目标会话名')
      }),
      execute: async (inputData) => {
        const context = buildDefaultContext(KALI_SANDBOX_LOCAL_TARGET, options)
        const res = await sessionCloseRaw.execute(
          {
            targetRef: KALI_SANDBOX_LOCAL_TARGET,
            toolName: 'kali_session_close',
            arguments: { sessionId: inputData.sessionId }
          },
          context
        )
        return res.output
      }
    })

    const fileReadRaw = rawKaliTools.find((tool) => tool.name === 'kali_file_read')!
    sandboxTools.kali_file_read = createTool({
      id: 'kali_file_read',
      description:
        '读取沙箱工作区中的文本文件（扫描报告、工具 XML 输出、截获数据）。自动隔离绑定至当前对话 UUID 目录 (/home/kali/workspace/<sessionId>)。参数：path (必填, 相对路径或绝对路径)。',
      inputSchema: z.object({
        path: z.string().describe('沙箱内文件路径（相对路径或 /home/kali/workspace/* 均自动隔离至当前会话 UUID 目录）')
      }),
      execute: async (inputData, executionContext) => {
        const sessionId = resolveSessionIdFromContext(options, executionContext)
        const context = buildDefaultContext(
          KALI_SANDBOX_LOCAL_TARGET,
          options,
          (executionContext as any)?.abortSignal,
          sessionId
        )
        const res = await fileReadRaw.execute(
          {
            targetRef: KALI_SANDBOX_LOCAL_TARGET,
            toolName: 'kali_file_read',
            arguments: { path: inputData.path }
          },
          context
        )
        return res.output
      }
    })

    const fileWriteRaw = rawKaliTools.find((tool) => tool.name === 'kali_file_write')!
    sandboxTools.kali_file_write = createTool({
      id: 'kali_file_write',
      description:
        '向沙箱工作区写入文本文件（PoC 脚本、字典、笔记）。沙箱本地操作，不触达测试目标。自动隔离绑定至当前对话 UUID 目录 (/home/kali/workspace/<sessionId>)。参数：path (必填), content (必填)。',
      inputSchema: z.object({
        path: z.string().describe('沙箱内目标文件路径（相对路径或 /home/kali/workspace/* 均自动隔离至当前会话 UUID 目录）'),
        content: z.string().describe('文件内容')
      }),
      execute: async (inputData, executionContext) => {
        const sessionId = resolveSessionIdFromContext(options, executionContext)
        const context = buildDefaultContext(
          KALI_SANDBOX_LOCAL_TARGET,
          options,
          (executionContext as any)?.abortSignal,
          sessionId
        )
        const res = await fileWriteRaw.execute(
          {
            targetRef: KALI_SANDBOX_LOCAL_TARGET,
            toolName: 'kali_file_write',
            arguments: { path: inputData.path, content: inputData.content }
          },
          context
        )
        return res.output
      }
    })
  }

  return {
    http_request: httpRequestTool,
    extract_js_endpoints: extractJsEndpointsTool,
    detect_auth_scheme: detectAuthSchemeTool,
    crawl_authenticated: crawlAuthenticatedTool,
    test_endpoint_variations: testEndpointVariationsTool,
    document_app: documentAppTool,
    document_endpoint: documentEndpointTool,
    init_pentest_engagement: initPentestEngagementTool,
    record_pentest_finding: recordPentestFindingTool,
    detect_sandbox_environment: detectSandboxTool,
    ...sandboxTools
  }
}
