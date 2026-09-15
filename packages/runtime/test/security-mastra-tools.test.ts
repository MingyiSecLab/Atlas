import { describe, it, expect } from 'vitest'
import { createSecurityMastraTools, createControllerConfig, pentestMode } from '../src/index.js'

describe('security mastra tools integration', () => {
  it('creates full set of security tools with proper tool shapes', () => {
    const tools = createSecurityMastraTools({
      workspacePath: '/tmp/test-workspace'
    })

    const expectedToolNames = [
      'http_request',
      'extract_js_endpoints',
      'detect_auth_scheme',
      'crawl_authenticated',
      'test_endpoint_variations',
      'document_app',
      'document_endpoint'
    ]

    for (const name of expectedToolNames) {
      expect(tools).toHaveProperty(name)
      const tool = tools[name as keyof typeof tools]
      expect(tool.id).toBe(name)
      expect(typeof tool.description).toBe('string')
      expect(tool.description.length).toBeGreaterThan(10)
      expect(typeof tool.execute).toBe('function')
    }
  })

  it('injects security tools into controllerConfig.extraTools by default', () => {
    const config = createControllerConfig({
      workspacePath: '/tmp/test-workspace'
    })

    expect(config.extraTools).toBeDefined()
    expect(typeof config.extraTools).toBe('object')
    const extra = config.extraTools as Record<string, unknown>
    expect(extra.http_request).toBeDefined()
    expect(extra.extract_js_endpoints).toBeDefined()
    expect(extra.detect_auth_scheme).toBeDefined()
  })

  it('merges custom extraTools when provided as an object', () => {
    const dummyTool = { id: 'custom_ping', execute: async () => 'pong' }
    const config = createControllerConfig({
      workspacePath: '/tmp/test-workspace',
      extraTools: {
        custom_ping: dummyTool as any
      }
    })

    const extra = config.extraTools as Record<string, unknown>
    expect(extra.http_request).toBeDefined()
    expect(extra.custom_ping).toBe(dummyTool)
  })

  it('merges custom extraTools when provided as a function', async () => {
    const dummyTool = { id: 'custom_func_tool', execute: async () => 'done' }
    const config = createControllerConfig({
      workspacePath: '/tmp/test-workspace',
      extraTools: async () => ({
        custom_func_tool: dummyTool as any
      })
    })

    expect(typeof config.extraTools).toBe('function')
    if (typeof config.extraTools === 'function') {
      const resolved = await config.extraTools({} as any)
      expect(resolved.http_request).toBeDefined()
      expect(resolved.custom_func_tool).toBe(dummyTool)
    }
  })
  it('pentestMode includes read-only workspace and security tools in availableTools', () => {
    expect(pentestMode.availableTools).toContain('init_pentest_engagement')
    expect(pentestMode.availableTools).toContain('record_pentest_finding')
    // 工作区工具的真实暴露名（非 read/grep/find，见 @mastra/code-sdk TOOL_NAME_OVERRIDES）
    expect(pentestMode.availableTools).toContain('view')
    expect(pentestMode.availableTools).toContain('search_content')
    expect(pentestMode.availableTools).toContain('find_files')
    expect(pentestMode.availableTools).toContain('file_stat')
    expect(pentestMode.availableTools).toContain('http_request')
    expect(pentestMode.availableTools).toContain('extract_js_endpoints')
    expect(pentestMode.availableTools).toContain('detect_auth_scheme')
    expect(pentestMode.availableTools).toContain('crawl_authenticated')
    expect(pentestMode.availableTools).toContain('test_endpoint_variations')
    expect(pentestMode.availableTools).toContain('document_app')
    expect(pentestMode.availableTools).toContain('document_endpoint')
    expect(pentestMode.availableTools).toContain('task_write')
    expect(pentestMode.availableTools).toContain('task_update')
    expect(pentestMode.availableTools).toContain('task_complete')
    expect(pentestMode.availableTools).toContain('task_check')
  })

  it('pentestMode instructions guide model on tool calling and DVWA/pentest practices', () => {
    expect(pentestMode.instructions).toContain('init_pentest_engagement')
    expect(pentestMode.instructions).toContain('record_pentest_finding')
    expect(pentestMode.instructions).toContain('http_request')
    expect(pentestMode.instructions).toContain('extract_js_endpoints')
    expect(pentestMode.instructions).toContain('view / search_content')
    expect(pentestMode.instructions).toContain('Tool Call')
  })

  it('creates pentest engagement and records findings via security tools', async () => {
    const { createRuntimePentestService } = await import('../src/pentest/service.js')
    const pentestService = createRuntimePentestService()

    let createdEventPayload: any = null
    pentestService.onCreated?.((eng) => {
      createdEventPayload = eng
    })

    const tools = createSecurityMastraTools({
      workspacePath: '/tmp/test-workspace',
      pentestService
    })

    expect(tools.init_pentest_engagement).toBeDefined()
    expect(tools.record_pentest_finding).toBeDefined()

    // 1. Initialize engagement
    const initRes = await (tools.init_pentest_engagement as any).execute({
      target: 'http://39.105.79.16:8080/dvwa',
      name: 'DVWA Target Assessment',
      scope: '39.105.79.16:8080'
    })

    expect(initRes).toContain('渗透测试任务初始化成功')
    expect(createdEventPayload).not.toBeNull()
    expect(createdEventPayload.config.origin).toBe('http://39.105.79.16:8080/dvwa')

    const activeId = createdEventPayload.id

    // 2. Record a vulnerability finding
    const findingRes = await (tools.record_pentest_finding as any).execute({
      endpoint: '/vulnerabilities/exec/',
      title: 'Command Injection via IP Parameter',
      severity: 'high',
      description: 'Host input parameter allows unescaped command concatenation.',
      evidence: 'Ping output contains: uid=33(www-data) gid=33(www-data)',
      remediation: 'Sanitize input using escapeshellcmd/escapeshellarg.'
    })

    expect(findingRes).toContain('成功记录安全漏洞与验证事实')
    expect(findingRes).toContain('Command Injection via IP Parameter')

    // 3. Verify snapshot contains the finding
    const snapshot = pentestService.get(activeId).snapshot()
    expect(snapshot).not.toBeNull()
    expect(snapshot.board.facts.length).toBeGreaterThan(0)
    expect(snapshot.evidence.length).toBeGreaterThan(0)
  })

  it('maintains cookies across calls and forwards cookies during redirects', async () => {
    const { createServer } = await import('node:http')
    const { AddressInfo } = await import('node:net')

    const server = createServer((req, res) => {
      if (req.url === '/login' && req.method === 'POST') {
        res.writeHead(302, {
          'Set-Cookie': 'PHPSESSID=sess_test_999; Path=/',
          Location: '/dashboard'
        })
        res.end()
        return
      }
      if (req.url === '/dashboard') {
        const cookie = req.headers.cookie || ''
        if (cookie.includes('PHPSESSID=sess_test_999')) {
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('Welcome to Dashboard')
        } else {
          res.writeHead(302, { Location: '/login' })
          res.end()
        }
        return
      }
      res.writeHead(404)
      res.end()
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const port = (server.address() as AddressInfo).port
    const baseUrl = `http://127.0.0.1:${port}`

    try {
      const tools = createSecurityMastraTools({
        workspacePath: '/tmp/test-workspace'
      })

      // 1. POST /login with followRedirects: true
      const loginRes = await tools.http_request.execute({
        url: `${baseUrl}/login`,
        method: 'POST',
        followRedirects: true
      })
      expect(loginRes).toContain('HTTP/1.1 200')
      expect(loginRes).toContain('Welcome to Dashboard')

      // 2. Subsequent GET /dashboard should automatically retain PHPSESSID from the cookie jar
      const dashboardRes = await tools.http_request.execute({
        url: `${baseUrl}/dashboard`,
        method: 'GET'
      })
      expect(dashboardRes).toContain('HTTP/1.1 200')
      expect(dashboardRes).toContain('Welcome to Dashboard')
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('forwards jsonBody, form, and response options through the mastra adapter', async () => {
    const { createServer } = await import('node:http')
    const { AddressInfo } = await import('node:net')

    const server = createServer((req, res) => {
      let raw = ''
      req.on('data', (chunk) => {
        raw += chunk
      })
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end(`ct=${req.headers['content-type']} body=${raw}`)
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const port = (server.address() as AddressInfo).port

    try {
      const tools = createSecurityMastraTools({ workspacePath: '/tmp/test-workspace' })

      const json = await tools.http_request.execute({
        url: `http://127.0.0.1:${port}/echo`,
        method: 'POST',
        jsonBody: { user: 'admin' },
        saveResponse: false
      })
      expect(json).toContain('ct=application/json')
      expect(json).toContain('body={"user":"admin"}')

      const form = await tools.http_request.execute({
        url: `http://127.0.0.1:${port}/echo`,
        method: 'POST',
        form: { user: 'admin', remember: true },
        maxRedirects: 2
      })
      expect(form).toContain('ct=application/x-www-form-urlencoded')
      expect(form).toContain('body=user=admin&remember=true')
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('isolates pentest document artifacts under ~/.atlas/sessions/<sessionId> when no project is selected', async () => {
    const { resolvePentestArtifactsRoot, createDocumentAppTool, createDocumentEndpointTool } =
      await import('../src/index.js')

    // 1. 无项目工程（开发目录或默认工作区） -> 隔离至 ~/.atlas/sessions/<sessionId>
    const sessionRoot = resolvePentestArtifactsRoot({
      workspacePath: '/Users/test/workspace/mingyi-tot/apps/desktop',
      sessionId: 'session-uuid-1234'
    })
    expect(sessionRoot).toContain('.atlas')
    expect(sessionRoot).toContain('sessions/session-uuid-1234')

    // 2. 明确选定了特定项目文件夹 -> 正常落入项目根目录
    const projectRoot = resolvePentestArtifactsRoot({
      workspacePath: '/Users/test/workspace/my-target-project',
      sessionId: 'session-uuid-1234'
    })
    expect(projectRoot).toBe('/Users/test/workspace/my-target-project')
  })
})
