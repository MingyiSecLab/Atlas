import { ElectronAPI } from '@electron-toolkit/preload'
import type { ProviderBridge } from '../shared/provider-ipc'
import type { FileBridge } from '../shared/file-ipc'
import type { UpdateBridge } from '../shared/update-ipc'
import type {
  RuntimeExpertBridge,
  RuntimeModelBridge,
  RuntimeModeBridge,
  RuntimeOmBridge,
  RuntimePentestBridge,
  RuntimeProjectBridge,
  RuntimeSkillBridge,
  RuntimeSessionBridge,
  RuntimeSubagentBridge,
  RuntimeWorkspaceBridge,
  RuntimeMcpBridge
} from '../shared/runtime-ipc'

interface MingyiDesktopApi {
  /** 窗口外壳的平台标识（只读），供顶栏做平台留白与窗口按钮让位。 */
  platform: NodeJS.Platform
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
  update: UpdateBridge
  models: RuntimeModelBridge
  modes: RuntimeModeBridge
  subagents: RuntimeSubagentBridge
  experts: RuntimeExpertBridge
  om: RuntimeOmBridge
  skills: RuntimeSkillBridge
  sessions: RuntimeSessionBridge
  mcp: RuntimeMcpBridge
  pentest: RuntimePentestBridge
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: MingyiDesktopApi
  }
}
