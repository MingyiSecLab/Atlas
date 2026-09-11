import React, { useState, useEffect, useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  FileText,
  FileJson,
  FileImage,
  File,
  Folder,
  FolderOpen,
  RefreshCw,
  Search,
  Loader2
} from 'lucide-react'
import type { WorkspaceFileItem } from '../../../../../shared/file-ipc'

interface FileTreeProps {
  workspacePath: string
  activeFilePath?: string
  onSelectFile: (file: WorkspaceFileItem) => void
  className?: string
}

function getFileIcon(item: WorkspaceFileItem): React.ReactNode {
  if (item.isDirectory) return null
  const ext = item.extension?.replace('.', '').toLowerCase() ?? ''

  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'py':
    case 'rs':
    case 'go':
    case 'cpp':
    case 'c':
    case 'sh':
      return <FileCode size={14} className="file-icon-code" />
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
      return <FileJson size={14} className="file-icon-json" />
    case 'md':
    case 'markdown':
    case 'txt':
      return <FileText size={14} className="file-icon-text" />
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return <FileImage size={14} className="file-icon-image" />
    default:
      return <File size={14} className="file-icon-default" />
  }
}

function formatFileSize(bytes?: number): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface TreeNodeProps {
  item: WorkspaceFileItem
  depth: number
  expandedPaths: Set<string>
  dirChildren: Map<string, WorkspaceFileItem[]>
  loadingPaths: Set<string>
  activeFilePath?: string
  onToggleDir: (dirPath: string) => void
  onSelectFile: (file: WorkspaceFileItem) => void
}

function TreeNode({
  item,
  depth,
  expandedPaths,
  dirChildren,
  loadingPaths,
  activeFilePath,
  onToggleDir,
  onSelectFile
}: TreeNodeProps): React.ReactNode {
  const isExpanded = expandedPaths.has(item.path)
  const isLoading = loadingPaths.has(item.path)
  const isSelected = activeFilePath === item.path
  const children = dirChildren.get(item.path) || []

  if (item.isDirectory) {
    return (
      <div className="file-tree-node-group">
        <div
          role="treeitem"
          aria-expanded={isExpanded}
          className={`file-tree-row is-folder ${isExpanded ? 'is-expanded' : ''}`}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          onClick={() => onToggleDir(item.path)}
        >
          <span className="file-tree-arrow">
            {isLoading ? (
              <Loader2 size={12} className="spin-icon" />
            ) : isExpanded ? (
              <ChevronDown size={13} />
            ) : (
              <ChevronRight size={13} />
            )}
          </span>
          <span className="file-tree-icon">
            {isExpanded ? (
              <FolderOpen size={14} className="folder-icon-open" />
            ) : (
              <Folder size={14} className="folder-icon-closed" />
            )}
          </span>
          <span className="file-tree-label" title={item.relativePath}>
            {item.name}
          </span>
        </div>
        {isExpanded && children.length > 0 && (
          <div className="file-tree-children" role="group">
            {children.map((child) => (
              <TreeNode
                key={child.path}
                item={child}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                dirChildren={dirChildren}
                loadingPaths={loadingPaths}
                activeFilePath={activeFilePath}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      role="treeitem"
      aria-selected={isSelected}
      className={`file-tree-row is-file ${isSelected ? 'is-selected' : ''}`}
      style={{ paddingLeft: `${depth * 14 + 23}px` }}
      onClick={() => onSelectFile(item)}
      title={`${item.relativePath} (${formatFileSize(item.size)})`}
    >
      <span className="file-tree-icon">{getFileIcon(item)}</span>
      <span className="file-tree-label">{item.name}</span>
      {item.size !== undefined && (
        <span className="file-tree-size">{formatFileSize(item.size)}</span>
      )}
    </div>
  )
}

export function FileTree({
  workspacePath,
  activeFilePath,
  onSelectFile,
  className = ''
}: FileTreeProps): React.ReactNode {
  const [rootItems, setRootItems] = useState<WorkspaceFileItem[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [dirChildren, setDirChildren] = useState<Map<string, WorkspaceFileItem[]>>(new Map())
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadDirectory = useCallback(
    async (dirPath?: string) => {
      const isRoot = !dirPath || dirPath === workspacePath
      if (!isRoot) {
        setLoadingPaths((prev) => new Set(prev).add(dirPath))
      }
      try {
        const items = await window.api.files.readDirectory(dirPath)
        if (isRoot) {
          setRootItems(items)
        } else {
          setDirChildren((prev) => new Map(prev).set(dirPath, items))
        }
      } catch (err) {
        console.error('Failed to load directory:', dirPath, err)
      } finally {
        if (!isRoot) {
          setLoadingPaths((prev) => {
            const next = new Set(prev)
            next.delete(dirPath)
            return next
          })
        }
      }
    },
    [workspacePath]
  )

  const refreshTree = useCallback(async () => {
    setIsRefreshing(true)
    setDirChildren(new Map())
    try {
      await loadDirectory(workspacePath)
      // Reload previously expanded directories
      for (const p of expandedPaths) {
        void loadDirectory(p)
      }
    } finally {
      setIsRefreshing(false)
    }
  }, [expandedPaths, loadDirectory, workspacePath])

  useEffect(() => {
    let cancelled = false
    void window.api.files.readDirectory(workspacePath).then((items) => {
      if (!cancelled) setRootItems(items)
    })
    return () => {
      cancelled = true
    }
  }, [workspacePath])

  const handleToggleDir = useCallback(
    async (dirPath: string) => {
      setExpandedPaths((prev) => {
        const next = new Set(prev)
        if (next.has(dirPath)) {
          next.delete(dirPath)
        } else {
          next.add(dirPath)
          if (!dirChildren.has(dirPath)) {
            void loadDirectory(dirPath)
          }
        }
        return next
      })
    },
    [dirChildren, loadDirectory]
  )

  // Filter items if searching
  const filteredRootItems = rootItems.filter((item) => {
    if (!searchQuery.trim()) return true
    return item.name.toLowerCase().includes(searchQuery.toLowerCase())
  })

  return (
    <div className={`workspace-file-tree-container ${className}`}>
      <div className="file-tree-toolbar">
        <div className="file-tree-search-wrap">
          <Search size={13} className="file-tree-search-icon" />
          <input
            type="text"
            className="file-tree-search-input"
            placeholder="过滤文件..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="file-tree-refresh-btn"
          onClick={() => void refreshTree()}
          disabled={isRefreshing}
          title="刷新目录"
        >
          <RefreshCw size={13} className={isRefreshing ? 'spin-icon' : ''} />
        </button>
      </div>

      <div className="file-tree-scrollable" role="tree" aria-label="工作区目录树">
        {filteredRootItems.length === 0 ? (
          <div className="file-tree-empty">
            {searchQuery ? '未匹配到相关文件' : '工作区目录为空'}
          </div>
        ) : (
          filteredRootItems.map((item) => (
            <TreeNode
              key={item.path}
              item={item}
              depth={0}
              expandedPaths={expandedPaths}
              dirChildren={dirChildren}
              loadingPaths={loadingPaths}
              activeFilePath={activeFilePath}
              onToggleDir={handleToggleDir}
              onSelectFile={onSelectFile}
            />
          ))
        )}
      </div>
    </div>
  )
}
