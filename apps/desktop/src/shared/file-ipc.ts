export interface WorkspaceFileItem {
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  size?: number
  mtimeMs?: number
  extension?: string
}

export interface FileReadResult {
  ok: boolean
  content?: string
  error?: string
}

export interface FileWriteResult {
  ok: boolean
  error?: string
}

export const FILE_IPC = {
  readDirectory: 'file:read-directory',
  readFile: 'file:read',
  writeFile: 'file:write'
} as const

export interface FileBridge {
  readDirectory: (dirPath?: string) => Promise<WorkspaceFileItem[]>
  readFile: (filePath: string) => Promise<FileReadResult>
  writeFile: (filePath: string, content: string) => Promise<FileWriteResult>
}
