import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RuntimeProject, RuntimeProjectStore } from './types.js'

/**
 * 基于文件系统的项目登记存储（`<directory>/projects.json` 单文件数组）。
 * 写入为临时文件 + 原子重命名；文件缺失或损坏时 load 返回空列表，
 * 不会让调用方启动失败（与 pentest store 的容错约定一致）。
 */
export interface FileProjectStoreOptions {
  /** 存储目录；不存在时会在写入时递归创建。 */
  directory: string
}

export class FileProjectStore implements RuntimeProjectStore {
  private readonly filePath: string

  constructor(options: { directory: string }) {
    if (!options.directory || typeof options.directory !== 'string')
      throw new Error('Project store directory must be a non-empty string.')
    this.filePath = join(options.directory, 'projects.json')
  }

  async load(): Promise<RuntimeProject[]> {
    let raw: string
    try {
      raw = readFileSync(this.filePath, 'utf8')
    } catch {
      return []
    }
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isProjectRecord)
    } catch {
      return []
    }
  }

  async save(projects: RuntimeProject[]): Promise<void> {
    mkdirSync(join(this.filePath, '..'), { recursive: true })
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tmpPath, JSON.stringify(projects), 'utf8')
    renameSync(tmpPath, this.filePath)
  }
}

function isProjectRecord(value: unknown): value is RuntimeProject {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    typeof record.name === 'string' &&
    typeof record.rootPath === 'string' &&
    typeof record.createdAt === 'string'
  )
}

export function createFileProjectStore(options: FileProjectStoreOptions): RuntimeProjectStore {
  return new FileProjectStore(options)
}

/** 内存版项目登记存储；未配置持久化目录时使用，进程退出即丢弃。 */
export class MemoryProjectStore implements RuntimeProjectStore {
  private projects: RuntimeProject[] = []

  async load(): Promise<RuntimeProject[]> {
    return [...this.projects]
  }

  async save(projects: RuntimeProject[]): Promise<void> {
    this.projects = [...projects]
  }
}

export function createMemoryProjectStore(): RuntimeProjectStore {
  return new MemoryProjectStore()
}
