import { createLocalRuntime } from '@mingyi/runtime'
import type { LocalRuntimeInstance } from '@mingyi/runtime'
import { app } from 'electron'
import { join, resolve } from 'node:path'

export class DesktopRuntimeManager {
  private workspacePath: string
  private runtimePromise: Promise<LocalRuntimeInstance> | undefined
  private lifecycle: Promise<void> = Promise.resolve()

  constructor(
    workspacePath = process.cwd(),
    private readonly dataRoot?: string
  ) {
    this.workspacePath = resolve(workspacePath)
  }

  getWorkspacePath(): string {
    return this.workspacePath
  }

  /** Pentest engagement 与证据的持久化目录（跨应用重启保留）。 */
  getPentestDataDir(): string {
    const override = process.env.MINGYI_PENTEST_DATA_DIR
    if (override) return resolve(override)
    return this.dataRoot ?? join(this.workspacePath, '.mingyi', 'pentest')
  }

  /** 项目空间登记的持久化目录（跨应用重启保留）。 */
  getProjectsDataDir(): string {
    const override = process.env.MINGYI_PROJECTS_DATA_DIR
    if (override) return resolve(override)
    return this.dataRoot
      ? join(this.dataRoot, 'projects')
      : join(app.getPath('userData'), 'projects')
  }

  async getRuntime(): Promise<LocalRuntimeInstance> {
    await this.lifecycle
    if (!this.runtimePromise) {
      const runtimePromise = createLocalRuntime({
        workspacePath: this.workspacePath,
        pentestDataDir: this.getPentestDataDir(),
        projectsDataDir: this.getProjectsDataDir()
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
