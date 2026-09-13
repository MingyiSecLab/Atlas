/**
 * 跨平台环境与安全沙箱 (mingyi-sandbox) 状态检测 IPC 契约定义。
 */

export type HostPlatform = 'windows' | 'macos' | 'linux'

export interface HostOsInfo {
  platform: HostPlatform
  platformRaw: string // process.platform (win32, darwin, linux)
  arch: string // x64, arm64
  osName: string // e.g. "macOS 15.0", "Windows 11", "Ubuntu 22.04"
  hostname: string
}

export interface DockerStatusInfo {
  installed: boolean
  running: boolean
  executablePath?: string
  version?: string
  apiVersion?: string
  error?: string
  suggestion?: string
}

export interface SandboxImageInfo {
  exists: boolean
  imageTag: string
  imageId?: string
  sizeBytes?: number
  sizeHuman?: string
  createdAt?: string
  architecture?: string
  isArchitectureMatch?: boolean
}

export interface SandboxContainerInfo {
  exists: boolean
  running: boolean
  containerId?: string
  containerName: string
  statusText?: string
  createdAt?: string
  hasNetCaps?: boolean
}

export interface SandboxToolStatus {
  id: string
  name: string
  category: 'recon' | 'exploit' | 'knowledge' | 'system'
  available: boolean
  version?: string
  error?: string
  detail?: string
}

export interface EnvironmentCheckResult {
  checkedAt: number
  host: HostOsInfo
  docker: DockerStatusInfo
  sandboxImage: SandboxImageInfo
  sandboxContainer: SandboxContainerInfo
  tools: SandboxToolStatus[]
  overallHealthy: boolean
}

export interface StartSandboxResult {
  ok: boolean
  containerId?: string
  error?: string
}

export interface StopSandboxResult {
  ok: boolean
  error?: string
}

export const ENVIRONMENT_IPC = {
  check: 'environment:check',
  startSandbox: 'environment:start-sandbox',
  stopSandbox: 'environment:stop-sandbox'
} as const

export interface EnvironmentBridge {
  check: () => Promise<EnvironmentCheckResult>
  startSandbox: () => Promise<StartSandboxResult>
  stopSandbox: () => Promise<StopSandboxResult>
}
