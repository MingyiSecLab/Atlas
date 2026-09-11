import { ipcMain } from 'electron'
import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, extname } from 'node:path'
import {
  FILE_IPC,
  type FileReadResult,
  type FileWriteResult,
  type WorkspaceFileItem
} from '../shared/file-ipc'
import type { DesktopRuntimeManager } from './runtime-manager'

const IGNORED_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  '.DS_Store',
  '.turbo',
  '.next',
  '.cache'
])

const MAX_READ_BYTES = 10 * 1024 * 1024 // 10 MB limit for text files

function resolveTargetDir(workspacePath: string, dirPath?: string): string {
  if (!dirPath || !dirPath.trim()) return workspacePath
  return isAbsolute(dirPath) ? resolve(dirPath) : resolve(workspacePath, dirPath)
}

export function registerFileService(runtimeManager: DesktopRuntimeManager): () => void {
  ipcMain.handle(
    FILE_IPC.readDirectory,
    async (_event, dirPath?: string): Promise<WorkspaceFileItem[]> => {
      const workspacePath = runtimeManager.getWorkspacePath()
      const targetDir = resolveTargetDir(workspacePath, dirPath)

      try {
        const dirents = await readdir(targetDir, { withFileTypes: true })
        const items: WorkspaceFileItem[] = []

        for (const dirent of dirents) {
          if (IGNORED_NAMES.has(dirent.name)) continue

          const fullPath = join(targetDir, dirent.name)
          const relPath = relative(workspacePath, fullPath).replace(/\\/g, '/')
          const isDir = dirent.isDirectory()

          let size: number | undefined
          let mtimeMs: number | undefined

          try {
            const stats = await stat(fullPath)
            size = isDir ? undefined : stats.size
            mtimeMs = stats.mtimeMs
          } catch {
            // Ignore stat errors for broken symlinks or locked files
          }

          items.push({
            name: dirent.name,
            path: fullPath,
            relativePath: relPath,
            isDirectory: isDir,
            size,
            mtimeMs,
            extension: isDir ? undefined : extname(dirent.name).toLowerCase()
          })
        }

        // Sort: directories first (case-insensitive), then files (case-insensitive)
        items.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1
          }
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
        })

        return items
      } catch (error) {
        process.stderr.write(`[file-service] readDirectory failed for ${targetDir}: ${error}\n`)
        return []
      }
    }
  )

  ipcMain.handle(FILE_IPC.readFile, async (_event, filePath: string): Promise<FileReadResult> => {
    try {
      const stats = await stat(filePath)
      if (stats.size > MAX_READ_BYTES) {
        return {
          ok: false,
          error: `文件过大 (${(stats.size / 1024 / 1024).toFixed(1)}MB)，无法在内置编辑器中打开`
        }
      }
      const content = await readFile(filePath, 'utf-8')
      return { ok: true, content }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle(
    FILE_IPC.writeFile,
    async (_event, filePath: string, content: string): Promise<FileWriteResult> => {
      try {
        await writeFile(filePath, content, 'utf-8')
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  return () => {
    ipcMain.removeHandler(FILE_IPC.readDirectory)
    ipcMain.removeHandler(FILE_IPC.readFile)
    ipcMain.removeHandler(FILE_IPC.writeFile)
  }
}
