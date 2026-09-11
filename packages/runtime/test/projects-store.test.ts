import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFileProjectStore, MemoryProjectStore } from '../src/projects/index.js'
import type { RuntimeProject } from '../src/projects/index.js'

const directories: string[] = []

function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'projects-store-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function sampleProject(id: string, rootPath: string): RuntimeProject {
  return {
    id,
    name: `project-${id}`,
    rootPath,
    createdAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('file project store persistence', () => {
  it('round-trips projects across store instances', async () => {
    const directory = tempDirectory()
    const first = createFileProjectStore({ directory })
    const projects = [
      sampleProject('p1', '/tmp/workspace-a'),
      sampleProject('p2', '/tmp/workspace-b')
    ]
    await first.save(projects)

    const second = createFileProjectStore({ directory })
    await expect(second.load()).resolves.toEqual(projects)
  })

  it('returns an empty list when the file does not exist', async () => {
    const store = createFileProjectStore({ directory: tempDirectory() })
    await expect(store.load()).resolves.toEqual([])
  })

  it('tolerates a corrupted file and drops malformed records', async () => {
    const directory = tempDirectory()
    writeFileSync(join(directory, 'projects.json'), '{not-json', 'utf8')
    expect(await createFileProjectStore({ directory }).load()).toEqual([])

    writeFileSync(
      join(directory, 'projects.json'),
      JSON.stringify([sampleProject('p1', '/tmp/a'), { id: 'broken' }, null, 'nope']),
      'utf8'
    )
    const loaded = await createFileProjectStore({ directory }).load()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe('p1')
  })

  it('writes atomically without leaving temp files behind', async () => {
    const directory = tempDirectory()
    const store = createFileProjectStore({ directory })
    await store.save([sampleProject('p1', '/tmp/a')])
    await store.save([sampleProject('p1', '/tmp/a'), sampleProject('p2', '/tmp/b')])

    const raw = readFileSync(join(directory, 'projects.json'), 'utf8')
    expect(JSON.parse(raw)).toHaveLength(2)
    const { readdirSync } = await import('node:fs')
    expect(readdirSync(directory).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('rejects invalid directories at construction time', () => {
    expect(() => createFileProjectStore({ directory: '' })).toThrow(/non-empty/)
  })
})

describe('memory project store', () => {
  it('keeps the last saved snapshot and returns copies', async () => {
    const store = new MemoryProjectStore()
    await expect(store.load()).resolves.toEqual([])
    const projects = [sampleProject('p1', '/tmp/a')]
    await store.save(projects)
    projects.pop()
    await expect(store.load()).resolves.toHaveLength(1)
    await store.save([])
    await expect(store.load()).resolves.toEqual([])
  })
})
