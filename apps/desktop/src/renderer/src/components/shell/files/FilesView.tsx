import React, { useState, useCallback } from 'react'
import { FolderSearch, FolderOpen, FileCode2, X, Loader2, AlertCircle } from 'lucide-react'
import { useWorkspace } from '../../../state/WorkspaceProvider'
import { FileTree } from './FileTree'
import { CodeEditor } from './CodeEditor'
import type { WorkspaceFileItem } from '../../../../../shared/file-ipc'

export function FilesView(): React.ReactNode {
  const { workspace, selectWorkspace } = useWorkspace()

  const [activeFile, setActiveFile] = useState<WorkspaceFileItem | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  const handleOpenFile = useCallback(async (file: WorkspaceFileItem) => {
    if (file.isDirectory) return
    setActiveFile(file)
    setIsLoadingFile(true)
    setFileError(null)

    try {
      const result = await window.api.files.readFile(file.path)
      if (result.ok && result.content !== undefined) {
        setFileContent(result.content)
      } else {
        setFileError(result.error || '无法读取文件内容')
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoadingFile(false)
    }
  }, [])

  const handleSaveFile = useCallback(
    async (newContent: string) => {
      if (!activeFile) return
      const result = await window.api.files.writeFile(activeFile.path, newContent)
      if (!result.ok) {
        throw new Error(result.error || '保存失败')
      }
      setFileContent(newContent)
    },
    [activeFile]
  )

  const handleCloseFile = useCallback(() => {
    setActiveFile(null)
    setFileContent('')
    setFileError(null)
  }, [])

  // Case 1: No workspace opened
  if (!workspace || !workspace.path) {
    return (
      <div
        className="right-panel-view right-panel-files-view is-empty"
        data-testid="right-panel-files"
      >
        <div className="workspace-files-empty-state">
          <div className="empty-state-icon-box">
            <FolderSearch size={28} />
          </div>
          <h3 className="empty-state-title">未选择工作区</h3>
          <p className="empty-state-desc">
            当前未打开项目工作区文件夹。选择一个本地目录以开始浏览文件并在内置编辑器中进行查看与编辑。
          </p>
          <button
            type="button"
            className="empty-state-action-btn"
            onClick={() => void selectWorkspace()}
          >
            <FolderOpen size={15} />
            <span>打开工作文件夹</span>
          </button>
        </div>
      </div>
    )
  }

  // Case 2: Workspace is opened
  return (
    <div className="right-panel-view right-panel-files-view" data-testid="right-panel-files">
      {/* Workspace Header Bar */}
      <div className="workspace-files-header">
        <div className="workspace-files-title" title={workspace.path}>
          <FolderOpen size={14} className="workspace-folder-icon" />
          <strong className="workspace-folder-name">{workspace.name}</strong>
        </div>
        <div className="workspace-files-header-actions">
          <button
            type="button"
            className="workspace-switch-btn"
            onClick={() => void selectWorkspace()}
            title="更换工作文件夹"
          >
            <FolderOpen size={12} />
            <span>切换工作区</span>
          </button>
        </div>
      </div>

      {/* Main Files Workbench Layout */}
      <div className="workspace-files-body">
        {/* Left Tree Area */}
        <div className={`workspace-files-tree-pane ${activeFile ? 'has-active-file' : ''}`}>
          <FileTree
            key={workspace.path}
            workspacePath={workspace.path}
            activeFilePath={activeFile?.path}
            onSelectFile={handleOpenFile}
          />
        </div>

        {/* Right Editor Area */}
        <div className="workspace-files-editor-pane">
          {activeFile ? (
            <div className="workspace-editor-card">
              <div className="workspace-editor-tab-strip">
                <div className="workspace-editor-tab is-active" title={activeFile.path}>
                  <span className="editor-tab-title">{activeFile.name}</span>
                  <span className="editor-tab-relpath">{activeFile.relativePath}</span>
                </div>
                <button
                  type="button"
                  className="workspace-editor-tab-close"
                  onClick={handleCloseFile}
                  title="关闭文件"
                >
                  <X size={13} />
                </button>
              </div>

              <div className="workspace-editor-content">
                {isLoadingFile ? (
                  <div className="workspace-editor-status-msg">
                    <Loader2 size={20} className="spin-icon" />
                    <span>正在加载文件内容...</span>
                  </div>
                ) : fileError ? (
                  <div className="workspace-editor-status-msg is-error">
                    <AlertCircle size={20} />
                    <span>{fileError}</span>
                  </div>
                ) : (
                  <CodeEditor
                    key={activeFile.path}
                    filePath={activeFile.path}
                    initialContent={fileContent}
                    onSave={handleSaveFile}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="workspace-editor-placeholder">
              <FileCode2 size={28} className="placeholder-icon" />
              <strong>选择文件以查看或编辑</strong>
              <span>支持多语言代码高亮与快捷键保存 (⌘S / Ctrl+S)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
