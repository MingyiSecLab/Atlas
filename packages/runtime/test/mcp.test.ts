import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createRuntimeMcpService } from '../src/mcp/service.js'

function createMockManager() {
  const statuses = [
    {
      name: 'github',
      connected: true,
      toolCount: 1,
      toolNames: ['github_search'],
      transport: 'http' as const
    }
  ]
  const manager = {
    getConfig: vi.fn(() => ({
      mcpServers: {
        github: {
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer secret' }
        }
      }
    })),
    getServerStatuses: vi.fn(() => statuses),
    getConfigPaths: vi.fn(() => ({
      project: '/project/.mastracode/mcp.json',
      global: '/global/mcp.json',
      claude: '/project/.claude/settings.local.json'
    })),
    reload: vi.fn(async () => undefined),
    reconnectServer: vi.fn(async () => statuses[0]),
    setServerDisabled: vi.fn(async () => statuses[0]),
    authenticateServer: vi.fn(async () => statuses[0]),
    cancelServerAuthentication: vi.fn(async () => true),
    getServerLogs: vi.fn(() => ['server started'])
  }
  return { manager: manager as never, raw: manager }
}

describe('runtime MCP service', () => {
  it('returns status with redacted config summaries', async () => {
    const mock = createMockManager()
    const service = createRuntimeMcpService({ manager: mock.manager, projectPath: '/project' })
    const [server] = service.list()

    expect(server?.status.toolNames).toEqual(['github_search'])
    expect(server?.config).toMatchObject({
      name: 'github',
      transport: 'http',
      url: 'https://example.com/mcp',
      headerKeys: ['Authorization']
    })
    expect(JSON.stringify(server)).not.toContain('secret')
  })

  it('atomically updates project MCP config and reloads the manager', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'mingyi-mcp-'))
    const mock = createMockManager()
    const service = createRuntimeMcpService({ manager: mock.manager, projectPath })

    await service.upsert('filesystem', {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem']
    })

    const configPath = join(projectPath, '.mastracode', 'mcp.json')
    const config = JSON.parse(await readFile(configPath, 'utf8')) as {
      mcpServers: Record<string, unknown>
    }
    expect(config.mcpServers.filesystem).toEqual({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem']
    })
    expect(mock.raw.reload).toHaveBeenCalledTimes(1)
  })

  it('reads a redacted project JSON config and preserves configured secrets', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'mingyi-mcp-json-'))
    const mock = createMockManager()
    const service = createRuntimeMcpService({ manager: mock.manager, projectPath })

    await service.upsert('remote', {
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer secret' }
    })
    const redacted = await service.getProjectConfig()
    expect(redacted.mcpServers.remote).toMatchObject({
      url: 'https://example.com/mcp',
      headers: { Authorization: '<configured>' }
    })

    await service.replaceProjectConfig({
      mcpServers: {
        remote: {
          url: 'https://example.com/updated',
          headers: { Authorization: '<configured>' }
        }
      }
    })
    const configPath = join(projectPath, '.mastracode', 'mcp.json')
    const config = JSON.parse(await readFile(configPath, 'utf8')) as {
      mcpServers: Record<string, { url: string; headers?: Record<string, string> }>
    }
    expect(config.mcpServers.remote).toEqual({
      url: 'https://example.com/updated',
      headers: { Authorization: 'Bearer secret' }
    })
  })

  it('rejects malformed project JSON server entries', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'mingyi-mcp-invalid-'))
    const mock = createMockManager()
    const service = createRuntimeMcpService({ manager: mock.manager, projectPath })

    await expect(
      service.replaceProjectConfig({
        mcpServers: { invalid: { command: 'node', url: 'https://example.com' } as never }
      })
    ).rejects.toThrow('exactly one of command or url')
  })

  it('rejects invalid names and unavailable managers', () => {
    const service = createRuntimeMcpService({ manager: undefined, projectPath: '/project' })
    expect(() => service.list()).toThrow('MCP is disabled')
    expect(() => service.get('bad/name')).toThrow('MCP server name')
  })
})
