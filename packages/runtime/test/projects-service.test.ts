import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFileProjectStore, createRuntimeProjectService } from '../src/projects/index.js'
import type { RuntimeProjectStore } from '../src/projects/index.js'

const directories: string[] = []

function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'projects-service-'))
  directories.push(directory)
  return directory
}

function tempWorkspace(): string {
  return tempDirectory()
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function createService(): {
  service: ReturnType<typeof createRuntimeProjectService>
  store: RuntimeProjectStore
  directory: string
} {
  const directory = tempDirectory()
  const store = createFileProjectStore({ directory })
  return { service: createRuntimeProjectService({ store }), store, directory }
}

describe('runtime project service', () => {
  it('creates a project with the basename as the default name', async () => {
    const { service } = createService()
    const workspace = tempWorkspace()
    const project = await service.create({ rootPath: workspace })
    expect(project.id).toBeTruthy()
    expect(project.name).toBe(workspace.split('/').pop())
    expect(project.rootPath).toBe(workspace)
    expect(project.createdAt).toBeTruthy()
    await expect(service.list()).resolves.toEqual([project])
  })

  it('rejects duplicate rootPaths regardless of name', async () => {
    const { service } = createService()
    const workspace = tempWorkspace()
    await service.create({ rootPath: workspace })
    await expect(service.create({ rootPath: workspace, name: '另一个' })).rejects.toThrow(
      /already registered/
    )
  })

  it('rejects relative or missing rootPaths', async () => {
    const { service } = createService()
    await expect(service.create({ rootPath: 'relative/path' })).rejects.toThrow(/absolute/)
    await expect(service.create({ rootPath: '/definitely/not/existing-xyz' })).rejects.toThrow(
      /does not exist/
    )
  })

  it('normalizes equivalent rootPaths for deduplication', async () => {
    const { service } = createService()
    const workspace = tempWorkspace()
    await service.create({ rootPath: `${workspace}/` })
    await expect(
      service.create({ rootPath: `${workspace}/sub/../` })
    ).rejects.toThrow(/already registered/)
  })

  it('renames a project and persists the change', async () => {
    const { service } = createService()
    const project = await service.create({ rootPath: tempWorkspace() })
    const renamed = await service.rename(project.id, '新名字')
    expect(renamed.name).toBe('新名字')
    await expect(service.rename(project.id, '  ')).rejects.toThrow(/non-empty/)
    await expect(service.rename('missing-id', 'x')).rejects.toThrow(/not found/)
  })

  it('touch updates lastOpenedAt', async () => {
    const { service } = createService()
    const project = await service.create({ rootPath: tempWorkspace() })
    expect(project.lastOpenedAt).toBeUndefined()
    await service.touch(project.id)
    const [updated] = await service.list()
    expect(updated.lastOpenedAt).toBeTruthy()
    await expect(service.touch('missing-id')).rejects.toThrow(/not found/)
  })

  it('remove only drops the registration and keeps the directory', async () => {
    const { service } = createService()
    const workspace = tempWorkspace()
    const project = await service.create({ rootPath: workspace })
    await service.remove(project.id)
    await expect(service.list()).resolves.toEqual([])
    expect(existsSync(workspace)).toBe(true)
  })

  it('persists projects across service restarts', async () => {
    const directory = tempDirectory()
    const workspace = tempWorkspace()
    const first = createRuntimeProjectService({
      store: createFileProjectStore({ directory })
    })
    const project = await first.create({ rootPath: workspace, name: '持久化' })

    const second = createRuntimeProjectService({
      store: createFileProjectStore({ directory })
    })
    const loaded = await second.list()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toEqual(project)
  })
})
