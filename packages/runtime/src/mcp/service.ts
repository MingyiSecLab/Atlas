import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  getProjectMcpPath,
  type McpServerConfig,
  type McpServerStatus,
  type McpManager
} from '@mastra/code-sdk/mcp/index'
import type {
  RuntimeMcpConfigPaths,
  RuntimeMcpServer,
  RuntimeMcpServerConfig,
  RuntimeMcpServerConfigSummary,
  RuntimeMcpService
} from './types.js'

interface RuntimeMcpServiceOptions {
  manager: McpManager | undefined
  projectPath: string
  configDir?: string
}

function requiredName(value: string): string {
  const name = value.trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name)) {
    throw new Error(
      'MCP server name must contain only letters, numbers, dots, underscores, or hyphens.'
    )
  }
  return name
}

function ensureManager(manager: McpManager | undefined): McpManager {
  if (!manager) throw new Error('MCP is disabled or unavailable.')
  return manager
}

function transport(config: McpServerConfig): 'stdio' | 'http' {
  return 'url' in config ? 'http' : 'stdio'
}

function summary(name: string, config: McpServerConfig): RuntimeMcpServerConfigSummary {
  if ('url' in config) {
    return {
      name,
      transport: 'http',
      url: config.url,
      headerKeys: Object.keys(config.headers ?? {}).sort(),
      envKeys: [],
      ...(config.oauth
        ? {
            oauth: {
              ...config.oauth,
              ...(config.oauth.clientSecret ? { hasClientSecret: true } : {})
            }
          }
        : {})
    }
  }
  return {
    name,
    transport: 'stdio',
    command: config.command,
    args: config.args,
    envKeys: Object.keys(config.env ?? {}).sort(),
    headerKeys: []
  }
}

function fallbackStatus(name: string, config: McpServerConfig): McpServerStatus {
  return {
    name,
    connected: false,
    toolCount: 0,
    toolNames: [],
    transport: transport(config),
    error: 'MCP server has not been initialized.'
  }
}

function snapshot(manager: McpManager): RuntimeMcpServer[] {
  const config = manager.getConfig().mcpServers ?? {}
  const statuses = new Map(manager.getServerStatuses().map((status) => [status.name, status]))
  return Object.entries(config).map(([name, serverConfig]) => ({
    status: statuses.get(name) ?? fallbackStatus(name, serverConfig),
    config: summary(name, serverConfig)
  }))
}

function parseProjectConfig(raw: string): { mcpServers?: Record<string, McpServerConfig> } {
  if (!raw.trim()) return {}
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Project MCP config must be a JSON object.')
  }
  const value = parsed as { mcpServers?: unknown }
  if (
    value.mcpServers !== undefined &&
    (!value.mcpServers || typeof value.mcpServers !== 'object')
  ) {
    throw new Error('Project MCP config mcpServers must be an object.')
  }
  const servers = (value.mcpServers ?? {}) as Record<string, unknown>
  if (Object.keys(servers).length > 100)
    throw new Error('MCP config cannot contain more than 100 servers.')
  for (const [name, config] of Object.entries(servers)) {
    requiredName(name)
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`MCP server "${name}" must be an object.`)
    }
    const candidate = config as Record<string, unknown>
    const hasCommand = typeof candidate.command === 'string'
    const hasUrl = typeof candidate.url === 'string'
    if (hasCommand === hasUrl) {
      throw new Error(`MCP server "${name}" must define exactly one of command or url.`)
    }
    if (hasCommand) {
      if (typeof candidate.command !== 'string' || !candidate.command.trim()) {
        throw new Error(`MCP server "${name}" command is required.`)
      }
      if (
        candidate.args !== undefined &&
        (!Array.isArray(candidate.args) || candidate.args.some((arg) => typeof arg !== 'string'))
      ) {
        throw new Error(`MCP server "${name}" args must be an array of strings.`)
      }
      if (
        candidate.env !== undefined &&
        (!candidate.env ||
          typeof candidate.env !== 'object' ||
          Array.isArray(candidate.env) ||
          Object.values(candidate.env).some((item) => typeof item !== 'string'))
      ) {
        throw new Error(`MCP server "${name}" env must be an object of strings.`)
      }
    } else {
      try {
        const url = new URL(String(candidate.url))
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol')
      } catch {
        throw new Error(`MCP server "${name}" url must use http or https.`)
      }
      if (
        candidate.headers !== undefined &&
        (!candidate.headers ||
          typeof candidate.headers !== 'object' ||
          Array.isArray(candidate.headers) ||
          Object.values(candidate.headers).some((item) => typeof item !== 'string'))
      ) {
        throw new Error(`MCP server "${name}" headers must be an object of strings.`)
      }
      if (
        candidate.oauth !== undefined &&
        (!candidate.oauth || typeof candidate.oauth !== 'object' || Array.isArray(candidate.oauth))
      ) {
        throw new Error(`MCP server "${name}" oauth must be an object.`)
      }
    }
  }
  return { mcpServers: servers as Record<string, McpServerConfig> }
}

const REDACTED_VALUE = '<configured>'

function redactProjectConfig(config: { mcpServers?: Record<string, McpServerConfig> }): {
  mcpServers: Record<string, McpServerConfig>
} {
  const servers: Record<string, McpServerConfig> = {}
  for (const [name, value] of Object.entries(config.mcpServers ?? {})) {
    if ('command' in value) {
      servers[name] = {
        ...value,
        ...(value.env
          ? { env: Object.fromEntries(Object.keys(value.env).map((key) => [key, REDACTED_VALUE])) }
          : {})
      }
    } else {
      servers[name] = {
        ...value,
        ...(value.headers
          ? {
              headers: Object.fromEntries(
                Object.keys(value.headers).map((key) => [key, REDACTED_VALUE])
              )
            }
          : {}),
        ...(value.oauth?.clientSecret
          ? { oauth: { ...value.oauth, clientSecret: REDACTED_VALUE } }
          : {})
      }
    }
  }
  return { mcpServers: servers }
}

function preserveRedactedValues(
  next: { mcpServers?: Record<string, McpServerConfig> },
  previous: { mcpServers?: Record<string, McpServerConfig> }
): { mcpServers: Record<string, McpServerConfig> } {
  const result: Record<string, McpServerConfig> = {}
  for (const [name, value] of Object.entries(next.mcpServers ?? {})) {
    const old = previous.mcpServers?.[name]
    if ('command' in value) {
      const oldEnv = old && 'command' in old ? old.env : undefined
      result[name] = {
        ...value,
        ...(value.env
          ? {
              env: Object.fromEntries(
                Object.entries(value.env).map(([key, item]) => [
                  key,
                  item === REDACTED_VALUE ? (oldEnv?.[key] ?? '') : item
                ])
              )
            }
          : {})
      }
    } else {
      const oldHeaders = old && 'url' in old ? old.headers : undefined
      const oldSecret = old && 'url' in old ? old.oauth?.clientSecret : undefined
      result[name] = {
        ...value,
        ...(value.headers
          ? {
              headers: Object.fromEntries(
                Object.entries(value.headers).map(([key, item]) => [
                  key,
                  item === REDACTED_VALUE ? (oldHeaders?.[key] ?? '') : item
                ])
              )
            }
          : {}),
        ...(value.oauth?.clientSecret === REDACTED_VALUE && oldSecret
          ? { oauth: { ...value.oauth, clientSecret: oldSecret } }
          : {})
      }
    }
  }
  return { mcpServers: result }
}

async function readProjectConfig(
  path: string
): Promise<{ mcpServers?: Record<string, McpServerConfig> }> {
  try {
    return parseProjectConfig(await readFile(path, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

async function writeProjectConfig(
  path: string,
  config: { mcpServers?: Record<string, McpServerConfig> }
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  await writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temp, path)
}

function validateConfig(config: RuntimeMcpServerConfig): void {
  if (!config || typeof config !== 'object') throw new Error('MCP server config is required.')
  if ('command' in config) {
    if (typeof config.command !== 'string' || !config.command.trim()) {
      throw new Error('MCP stdio command must be a non-empty string.')
    }
    if (
      config.args &&
      (!Array.isArray(config.args) || config.args.some((arg) => typeof arg !== 'string'))
    ) {
      throw new Error('MCP stdio args must be an array of strings.')
    }
    return
  }
  if (!('url' in config) || typeof config.url !== 'string' || !config.url.trim()) {
    throw new Error('MCP HTTP url must be a non-empty string.')
  }
  const url = new URL(config.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('MCP HTTP url must use http or https.')
  }
}

export function createRuntimeMcpService(options: RuntimeMcpServiceOptions): RuntimeMcpService {
  const projectConfigPath = getProjectMcpPath(options.projectPath, options.configDir)
  const list = (): RuntimeMcpServer[] => snapshot(ensureManager(options.manager))
  const get = (name: string): RuntimeMcpServer | null => {
    const id = requiredName(name)
    return list().find((server) => server.status.name === id) ?? null
  }

  return {
    list,
    get,
    getConfigPaths: (): RuntimeMcpConfigPaths => ensureManager(options.manager).getConfigPaths(),
    getProjectConfig: async () => redactProjectConfig(await readProjectConfig(projectConfigPath)),
    replaceProjectConfig: async (config) => {
      const manager = ensureManager(options.manager)
      const parsed = parseProjectConfig(JSON.stringify(config))
      const previous = await readProjectConfig(projectConfigPath)
      const merged = preserveRedactedValues(parsed, previous)
      await writeProjectConfig(projectConfigPath, merged)
      await manager.reload()
      return list()
    },
    upsert: async (name, config) => {
      const id = requiredName(name)
      validateConfig(config)
      const file = await readProjectConfig(projectConfigPath)
      await writeProjectConfig(projectConfigPath, {
        ...file,
        mcpServers: { ...(file.mcpServers ?? {}), [id]: config }
      })
      await ensureManager(options.manager).reload()
      const server = get(id)
      return server ?? { status: fallbackStatus(id, config), config: summary(id, config) }
    },
    remove: async (name) => {
      const id = requiredName(name)
      const file = await readProjectConfig(projectConfigPath)
      if (!file.mcpServers?.[id]) return
      const next = { ...file.mcpServers }
      delete next[id]
      await writeProjectConfig(projectConfigPath, {
        ...file,
        ...(Object.keys(next).length > 0 ? { mcpServers: next } : { mcpServers: {} })
      })
      await ensureManager(options.manager).reload()
    },
    reload: async () => {
      await ensureManager(options.manager).reload()
      return list()
    },
    reconnect: (name) =>
      ensureManager(options.manager)
        .reconnectServer(requiredName(name))
        .then(() => get(name)!)
        .then((server) => {
          if (!server) throw new Error('MCP server was not found after reconnect.')
          return server
        }),
    setDisabled: (name, disabled, scope = 'project') =>
      ensureManager(options.manager)
        .setServerDisabled(requiredName(name), disabled, { global: scope === 'global' })
        .then(() => get(name)!)
        .then((server) => {
          if (!server) throw new Error('MCP server was not found after updating disabled state.')
          return server
        }),
    setAllDisabled: async (disabled, scope = 'project') => {
      await ensureManager(options.manager).setAllDisabled(disabled, { global: scope === 'global' })
    },
    authenticate: async (name, onAuthorizationUrl) => {
      await ensureManager(options.manager).authenticateServer(requiredName(name), {
        onAuthorizationUrl
      })
      const server = get(name)
      if (!server) throw new Error('MCP server was not found after authentication.')
      return server
    },
    cancelAuthentication: (name) =>
      ensureManager(options.manager).cancelServerAuthentication(requiredName(name)),
    getLogs: (name) => ensureManager(options.manager).getServerLogs(requiredName(name))
  }
}
