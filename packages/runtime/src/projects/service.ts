import { randomUUID } from 'node:crypto'
import { basename, isAbsolute, resolve } from 'node:path'
import { statSync } from 'node:fs'
import type {
  RuntimeProject,
  RuntimeProjectCreateInput,
  RuntimeProjectService,
  RuntimeProjectStore
} from './types.js'

export interface RuntimeProjectServiceOptions {
  store: RuntimeProjectStore
}

function normalizeRootPath(rootPath: string): string {
  if (!rootPath || typeof rootPath !== 'string')
    throw new Error('Project rootPath must be a non-empty string.')
  if (!isAbsolute(rootPath)) throw new Error(`Project rootPath must be absolute: ${rootPath}.`)
  return resolve(rootPath)
}

function assertExistingDirectory(rootPath: string): void {
  let stat
  try {
    stat = statSync(rootPath)
  } catch {
    throw new Error(`Project rootPath does not exist: ${rootPath}.`)
  }
  if (!stat.isDirectory()) throw new Error(`Project rootPath is not a directory: ${rootPath}.`)
}

function assertValidName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Project name must be a non-empty string.')
  return trimmed
}

export function createRuntimeProjectService(
  options: RuntimeProjectServiceOptions
): RuntimeProjectService {
  const { store } = options

  const loadAll = async (): Promise<RuntimeProject[]> => {
    const projects = await store.load()
    return [...projects].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  }

  const persist = async (projects: RuntimeProject[]): Promise<void> => {
    await store.save(projects)
  }

  return {
    async list(): Promise<RuntimeProject[]> {
      return loadAll()
    },

    async create(input: RuntimeProjectCreateInput): Promise<RuntimeProject> {
      const rootPath = normalizeRootPath(input.rootPath)
      assertExistingDirectory(rootPath)
      const projects = await loadAll()
      if (projects.some((project) => resolve(project.rootPath) === rootPath))
        throw new Error(`Project already registered for rootPath: ${rootPath}.`)
      const project: RuntimeProject = {
        id: randomUUID(),
        name: input.name ? assertValidName(input.name) : basename(rootPath),
        rootPath,
        createdAt: new Date().toISOString()
      }
      await persist([...projects, project])
      return project
    },

    async rename(id: string, name: string): Promise<RuntimeProject> {
      const nextName = assertValidName(name)
      const projects = await loadAll()
      const project = projects.find((candidate) => candidate.id === id)
      if (!project) throw new Error(`Project not found: ${id}.`)
      project.name = nextName
      await persist(projects)
      return project
    },

    async remove(id: string): Promise<void> {
      const projects = await loadAll()
      await persist(projects.filter((project) => project.id !== id))
    },

    async touch(id: string): Promise<void> {
      const projects = await loadAll()
      const project = projects.find((candidate) => candidate.id === id)
      if (!project) throw new Error(`Project not found: ${id}.`)
      project.lastOpenedAt = new Date().toISOString()
      await persist(projects)
    }
  }
}
