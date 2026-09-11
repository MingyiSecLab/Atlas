import type { McpServerConfig, McpServerStatus } from '@mastra/code-sdk/mcp/index'
import type { McpHttpOAuthConfig } from '@mastra/code-sdk/mcp/types'

export type RuntimeMcpServerConfig = McpServerConfig
export type RuntimeMcpServerStatus = McpServerStatus
export type RuntimeMcpOAuthConfig = McpHttpOAuthConfig

export interface RuntimeMcpConfigPaths {
  project: string
  global: string
  claude: string
}

export interface RuntimeMcpServerConfigSummary {
  name: string
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  envKeys: string[]
  headerKeys: string[]
  oauth?: Omit<RuntimeMcpOAuthConfig, 'clientSecret'> & { hasClientSecret?: boolean }
}

export interface RuntimeMcpServer {
  status: RuntimeMcpServerStatus
  config: RuntimeMcpServerConfigSummary
}

export interface RuntimeMcpProjectConfig {
  mcpServers: Record<string, RuntimeMcpServerConfig>
}

export interface RuntimeMcpService {
  list(): RuntimeMcpServer[]
  get(name: string): RuntimeMcpServer | null
  getConfigPaths(): RuntimeMcpConfigPaths
  getProjectConfig(): Promise<RuntimeMcpProjectConfig>
  replaceProjectConfig(config: RuntimeMcpProjectConfig): Promise<RuntimeMcpServer[]>
  upsert(name: string, config: RuntimeMcpServerConfig): Promise<RuntimeMcpServer>
  remove(name: string): Promise<void>
  reload(): Promise<RuntimeMcpServer[]>
  reconnect(name: string): Promise<RuntimeMcpServer>
  setDisabled(
    name: string,
    disabled: boolean,
    scope?: 'project' | 'global'
  ): Promise<RuntimeMcpServer>
  setAllDisabled(disabled: boolean, scope?: 'project' | 'global'): Promise<void>
  authenticate(name: string, onAuthorizationUrl?: (url: string) => void): Promise<RuntimeMcpServer>
  cancelAuthentication(name: string): Promise<boolean>
  getLogs(name: string): string[]
}
