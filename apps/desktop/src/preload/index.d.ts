import { ElectronAPI } from '@electron-toolkit/preload'
import type { ProviderBridge } from '../shared/provider-ipc'
import type { FileBridge } from '../shared/file-ipc'
import type { EnvironmentBridge } from '../shared/environment-ipc'
import type {
  RuntimeExpertBridge,
  RuntimeModelBridge,
  RuntimeModeBridge,
  RuntimeOmBridge,
  RuntimePentestBridge,
  RuntimeProjectBridge,
  RuntimeSkillBridge,
  RuntimeSessionBridge,
  RuntimeWorkspaceBridge,
  RuntimeMcpBridge
} from '../shared/runtime-ipc'

interface MingyiDesktopApi {
  createTerminal: (
    id: string,
    options?: { cols?: number; rows?: number; cwd?: string; shell?: string }
  ) => Promise<{ ok: boolean; error?: string }>
  sendTerminalInput: (id: string, data: string) => void
  resizeTerminal: (id: string, cols: number, rows: number) => void
  disposeTerminal: (id: string) => void
  onTerminalData: (listener: (id: string, data: string) => void) => () => void
  onTerminalExit: (
    listener: (id: string, detail: { exitCode: number; signal?: number }) => void
  ) => () => void
  providers: ProviderBridge
  workspace: RuntimeWorkspaceBridge
  projects: RuntimeProjectBridge
  files: FileBridge
  models: RuntimeModelBridge
  modes: RuntimeModeBridge
  experts: RuntimeExpertBridge
  om: RuntimeOmBridge
  skills: RuntimeSkillBridge
  sessions: RuntimeSessionBridge
  mcp: RuntimeMcpBridge
  pentest: RuntimePentestBridge
  environment: EnvironmentBridge
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: MingyiDesktopApi
  }
}
