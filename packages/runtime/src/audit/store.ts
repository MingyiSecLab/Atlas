import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AuditRun, RuntimeAuditStore } from './types.js'

export interface FileAuditStoreOptions {
  /** 持久化根目录（如 ~/.atlas/audit）；缺省时退化为内存语义（save 为空操作）。 */
  directory?: string
}

/**
 * 审计 run 的文件持久化：每个 run 一个 JSON 文件（<directory>/<runId>.json），
 * 写入采用临时文件 + rename 原子替换。崩溃后由 service.load() 恢复。
 */
export class FileAuditStore implements RuntimeAuditStore {
  private readonly directory?: string

  constructor(options: FileAuditStoreOptions = {}) {
    this.directory = options.directory
  }

  async load(): Promise<readonly AuditRun[]> {
    if (!this.directory) return []
    const { readdir } = await import('node:fs/promises')
    let entries: string[]
    try {
      entries = await readdir(this.directory)
    } catch {
      return []
    }
    const runs: AuditRun[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      try {
        const raw = await readFile(join(this.directory, entry), 'utf8')
        const parsed = JSON.parse(raw) as AuditRun
        if (parsed && typeof parsed.id === 'string' && Array.isArray(parsed.units)) {
          runs.push(parsed)
        }
      } catch {
        // 损坏的单文件跳过，不阻塞其余 run 恢复。
      }
    }
    return runs.sort((a, b) => a.createdAt - b.createdAt)
  }

  async save(run: AuditRun): Promise<void> {
    if (!this.directory) return
    await mkdir(this.directory, { recursive: true })
    const finalPath = join(this.directory, `${run.id}.json`)
    const tmpPath = `${finalPath}.tmp`
    await writeFile(tmpPath, JSON.stringify(run, null, 2), 'utf8')
    await rename(tmpPath, finalPath)
  }
}
