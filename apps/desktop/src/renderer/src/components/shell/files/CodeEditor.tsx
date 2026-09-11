import React, { useEffect, useRef, useState, useCallback } from 'react'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language'
import { search, searchKeymap } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'
import { getLanguageExtension } from './languages'
import { Save, Check, Loader2 } from 'lucide-react'

interface CodeEditorProps {
  filePath: string
  initialContent: string
  onSave?: (newContent: string) => Promise<void> | void
  className?: string
  readOnly?: boolean
}

export function CodeEditor({
  filePath,
  initialContent,
  onSave,
  className = '',
  readOnly = false
}: CodeEditorProps): React.ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const savedContentRef = useRef(initialContent)

  const { extension: langExt, label: langLabel } = getLanguageExtension(filePath)

  const handleSave = useCallback(async () => {
    if (!viewRef.current || !onSave) return
    const content = viewRef.current.state.doc.toString()
    setIsSaving(true)
    try {
      await onSave(content)
      savedContentRef.current = content
      setIsDirty(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }, [onSave])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const isDark = document.documentElement.classList.contains('dark')

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          void handleSave()
          return true
        }
      }
    ])

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const currentDoc = update.state.doc.toString()
        setIsDirty(currentDoc !== savedContentRef.current)
      }
      if (update.selectionSet || update.docChanged) {
        const pos = update.state.selection.main.head
        const line = update.state.doc.lineAt(pos)
        setCursorPos({ line: line.number, col: pos - line.from + 1 })
      }
    })

    const customTheme = EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '13px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
      },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: 'inherit'
      },
      '.cm-content': {
        padding: '8px 0'
      },
      '.cm-line': {
        padding: '0 12px'
      },
      '.cm-gutters': {
        backgroundColor: isDark ? '#161b22' : '#f6f8fa',
        color: isDark ? '#6e7681' : '#8c959f',
        borderRight: isDark ? '1px solid #30363d' : '1px solid #e1e4e8',
        paddingRight: '6px'
      }
    })

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      bracketMatching(),
      search({ top: true }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      saveKeymap,
      updateListener,
      customTheme,
      ...(isDark ? [oneDark] : []),
      ...(langExt ? [langExt] : []),
      ...(readOnly ? [EditorState.readOnly.of(true)] : [])
    ]

    const state = EditorState.create({
      doc: initialContent,
      extensions
    })

    const view = new EditorView({
      state,
      parent: container
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [filePath, initialContent, handleSave, langExt, readOnly])

  return (
    <div className={`workspace-code-editor-root ${className}`}>
      <div className="workspace-code-editor-canvas" ref={containerRef} />
      <div className="workspace-code-editor-statusbar">
        <div className="statusbar-left">
          <span className="statusbar-item">
            行 {cursorPos.line}, 列 {cursorPos.col}
          </span>
          <span className="statusbar-item">{langLabel}</span>
          <span className="statusbar-item">UTF-8</span>
        </div>
        <div className="statusbar-right">
          {onSave && (
            <button
              type="button"
              className={`statusbar-save-btn ${isDirty ? 'is-dirty' : ''}`}
              onClick={() => void handleSave()}
              disabled={isSaving || !isDirty}
              title="保存 (⌘S / Ctrl+S)"
            >
              {isSaving ? (
                <>
                  <Loader2 size={12} className="spin-icon" />
                  <span>正在保存...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <Check size={12} color="#16a34a" />
                  <span>已保存</span>
                </>
              ) : (
                <>
                  <Save size={12} />
                  <span>{isDirty ? '保存 *' : '已保存'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
