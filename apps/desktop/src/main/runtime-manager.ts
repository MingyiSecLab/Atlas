import { createLocalRuntime, createRuntimeVectorStore } from '@mingyi/runtime'
import type { DockerSandboxConfig, LocalRuntimeInstance } from '@mingyi/runtime'
import { app } from 'electron'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export class DesktopRuntimeManager {
  private workspacePath: string
  private runtimePromise: Promise<LocalRuntimeInstance> | undefined
  private lifecycle: Promise<void> = Promise.resolve()

  constructor(
    workspacePath?: string,
    private readonly dataRoot?: string
  ) {
    const fallback = this.dataRoot
      ? join(this.dataRoot, 'workspace')
      : join(homedir(), '.atlas', 'workspace')
    this.workspacePath = resolve(workspacePath || fallback)
  }

  getWorkspacePath(): string {
    return this.workspacePath
  }

  /** Pentest engagement 与证据的持久化目录（跨应用重启保留）。 */
  getPentestDataDir(): string {
    const override = process.env.MINGYI_PENTEST_DATA_DIR
    if (override) return resolve(override)
    return this.dataRoot
      ? join(this.dataRoot, 'pentest')
      : join(this.workspacePath, '.mingyi', 'pentest')
  }

  /** 项目空间登记的持久化目录（跨应用重启保留）。 */
  getProjectsDataDir(): string {
    const override = process.env.MINGYI_PROJECTS_DATA_DIR
    if (override) return resolve(override)
    return this.dataRoot
      ? join(this.dataRoot, 'projects')
      : join(app.getPath('userData'), 'projects')
  }

  /**
   * Kali 沙箱工作区在宿主机的持久化挂载目录。
   * 优先读 MINGYI_SANDBOX_WORKSPACE_DIR，未指定时默认集中于 Atlas 数据根（~/.atlas/sandbox_workspace）。
   * 跨平台：macOS/Linux 为 ~/.atlas/sandbox_workspace，Windows 为 %USERPROFILE%\.atlas\sandbox_workspace。
   * 避免渗透测试生成的 PoC 脚本与扫描结果污染应用源码（如 apps/）。
   */
  getSandboxWorkspaceDir(): string {
    const override = process.env.MINGYI_SANDBOX_WORKSPACE_DIR
    if (override) return resolve(override)
    return this.dataRoot
      ? join(this.dataRoot, 'sandbox_workspace')
      : join(homedir(), '.atlas', 'sandbox_workspace')
  }

  /**
   * Kali 沙箱配置（默认启用；容器按需拉起，未调用 kali_* 工具前不触碰 Docker）。
   * 置 MINGYI_SANDBOX_DISABLED=1 可整体关闭沙箱能力。
   */
  getSandboxConfig(): DockerSandboxConfig | undefined {
    if (process.env.MINGYI_SANDBOX_DISABLED) return undefined
    return {
      containerName: process.env.MINGYI_SANDBOX_CONTAINER || 'mingyi-sandbox',
      image: process.env.MINGYI_SANDBOX_IMAGE || 'mingyi-sandbox:latest',
      networkMode: process.env.MINGYI_SANDBOX_NETWORK || 'host',
      hostWorkspaceDir: this.getSandboxWorkspaceDir()
    }
  }

  async getRuntime(): Promise<LocalRuntimeInstance> {
    await this.lifecycle
    if (!this.runtimePromise) {
      const runtimePromise = createLocalRuntime({
        workspacePath: this.workspacePath,
        pentestDataDir: this.getPentestDataDir(),
        projectsDataDir: this.getProjectsDataDir(),
        // atlas 数据根（~/.atlas）：settings.json / 用户级 agents / 向量库 / blobs 分流
        ...(this.dataRoot
          ? {
              vector: createRuntimeVectorStore({
                url: `file:${join(this.dataRoot, 'vectors.db')}`
              }),
              settingsPath: join(this.dataRoot, 'settings.json'),
              userAgentsDir: join(this.dataRoot, 'agents'),
              blobsDir: join(this.dataRoot, 'blobs')
            }
          : {}),
        ...(this.getSandboxConfig() ? { sandbox: this.getSandboxConfig() } : {})
      })
      this.runtimePromise = runtimePromise
      runtimePromise.catch(() => {
        if (this.runtimePromise === runtimePromise) this.runtimePromise = undefined
      })
    }

    return this.runtimePromise
  }

  async setWorkspacePath(workspacePath: string): Promise<void> {
    const nextWorkspacePath = resolve(workspacePath)
    const operation = this.lifecycle.then(async () => {
      if (nextWorkspacePath === this.workspacePath) return
      const runtimePromise = this.runtimePromise
      this.runtimePromise = undefined
      if (runtimePromise) await (await runtimePromise).shutdown()
      this.workspacePath = nextWorkspacePath
    })
    this.lifecycle = operation.catch(() => undefined)
    await operation
  }

  async shutdown(): Promise<void> {
    const operation = this.lifecycle.then(async () => {
      const runtimePromise = this.runtimePromise
      this.runtimePromise = undefined
      if (!runtimePromise) return
      const runtime = await runtimePromise
      await runtime.shutdown()
    })
    this.lifecycle = operation.catch(() => undefined)
    await operation
  }
}
