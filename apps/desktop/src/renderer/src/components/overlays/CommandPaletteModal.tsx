import React, { useCallback, useState, useEffect, useRef } from 'react'
import {
  Search,
  Bot,
  Plus,
  Folder,
  Sparkles,
  ArrowUp,
  ArrowDown,
  CornerDownLeft
} from 'lucide-react'

interface CommandPaletteModalProps {
  isOpen: boolean
  threads: ThreadItem[]
  onClose: () => void
  onSelectTask: (id: string) => void
  onNewTask: (projectId?: string) => void
}

interface ThreadItem {
  id: string
  title: string
  time: string
}

interface CommandItem {
  id: string
  label: string
  shortcut?: string
  action: () => void
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  threads,
  onClose,
  onSelectTask,
  onNewTask
}) => {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const close = useCallback((): void => {
    setQuery('')
    setSelectedIndex(0)
    onClose()
  }, [onClose])

  // Auto-focus input when opened
  useEffect(() => {
    if (!isOpen) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50)
    return () => window.clearTimeout(timer)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [close, isOpen])

  const commands: CommandItem[] = [
    {
      id: 'cmd-new',
      label: '新建任务',
      shortcut: '⌘N',
      action: () => {
        onNewTask()
        close()
      }
    },
    {
      id: 'cmd-doc',
      label: '文档处理助手',
      shortcut: '/doc',
      action: () => {
        close()
      }
    },
    {
      id: 'cmd-code',
      label: '代码开发专家',
      shortcut: '/code',
      action: () => {
        close()
      }
    },
    {
      id: 'cmd-finance',
      label: '金融数据分析',
      shortcut: '/finance',
      action: () => {
        close()
      }
    },
    {
      id: 'cmd-project',
      label: '项目新手指引',
      shortcut: '空间 (1)',
      action: () => {
        close()
      }
    }
  ]

  // Filter items matching Linkcode match algorithm
  const safeQuery = (query ?? '').toLowerCase()
  const filteredThreads = (threads ?? []).filter((t) =>
    (t?.title ?? '').toLowerCase().includes(safeQuery)
  )
  const filteredCommands = commands.filter(
    (c) =>
      (c.label ?? '').toLowerCase().includes(safeQuery) ||
      (c.shortcut && c.shortcut.toLowerCase().includes(safeQuery))
  )

  // Combined flat list for keyboard indexing
  const combinedList = [
    ...filteredThreads.map((t) => ({
      type: 'thread' as const,
      data: t,
      action: () => {
        if (t?.id) onSelectTask(t.id)
        close()
      }
    })),
    ...filteredCommands.map((c) => ({
      type: 'command' as const,
      data: c,
      action: c.action
    }))
  ]

  // Handle keyboard navigation (↑ ↓ Enter Esc)
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, combinedList.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(
        (prev) => (prev - 1 + combinedList.length) % Math.max(1, combinedList.length)
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (combinedList[selectedIndex]) {
        combinedList[selectedIndex].action()
      }
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.32)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        zIndex: 1000
      }}
      onClick={close}
    >
      {/* Linkcode exact Popup Dialog Box */}
      <div
        className="app-no-drag"
        role="dialog"
        aria-modal="true"
        aria-label="全局搜索"
        style={{
          width: '576px',
          maxWidth: '90vw',
          maxHeight: '420px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          boxShadow: '0 16px 40px -8px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0, 0, 0, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          outline: 'none'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Linkcode CommandInput Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #f0f0f2',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <Search size={16} color="#8e8e93" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="搜索对话或指令..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '14px',
              color: '#1c1c1e',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
              backgroundColor: 'transparent'
            }}
          />
        </div>

        {/* Linkcode CommandList Viewport */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '6px 0'
          }}
        >
          {combinedList.length === 0 ? (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: '#8e8e93',
                fontSize: '13px'
              }}
            >
              无匹配结果
            </div>
          ) : (
            <>
              {/* Group 1: Recent Threads */}
              {filteredThreads.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: '8px 16px 4px 16px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#8e8e93',
                      letterSpacing: '0.4px',
                      textTransform: 'uppercase'
                    }}
                  >
                    {query ? '匹配对话' : '最近对话'}
                  </div>
                  {filteredThreads.map((thread) => {
                    const globalIdx = combinedList.findIndex(
                      (item) => item.type === 'thread' && item.data.id === thread.id
                    )
                    const isSelected = globalIdx === selectedIndex
                    return (
                      <div
                        key={thread.id}
                        onClick={() => {
                          onSelectTask(thread.id)
                          close()
                        }}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          height: '36px',
                          padding: '0 12px',
                          margin: '2px 8px',
                          borderRadius: '8px',
                          backgroundColor: isSelected ? '#f2f2f7' : 'transparent',
                          cursor: 'pointer',
                          transition: 'background 0.1s ease'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            minWidth: 0
                          }}
                        >
                          <Bot size={16} color="#6e6e73" />
                          <span
                            style={{
                              fontSize: '13px',
                              color: '#1c1c1e',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {thread.title}
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#8e8e93', flexShrink: 0 }}>
                          {thread.time}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Group Separator */}
              {filteredThreads.length > 0 && filteredCommands.length > 0 && (
                <div style={{ height: '1px', backgroundColor: '#f4f4f6', margin: '6px 0' }} />
              )}

              {/* Group 2: Commands & Actions */}
              {filteredCommands.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: '8px 16px 4px 16px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#8e8e93',
                      letterSpacing: '0.4px',
                      textTransform: 'uppercase'
                    }}
                  >
                    {query ? '匹配指令' : '推荐指令'}
                  </div>
                  {filteredCommands.map((cmd) => {
                    const globalIdx = combinedList.findIndex(
                      (item) => item.type === 'command' && item.data.id === cmd.id
                    )
                    const isSelected = globalIdx === selectedIndex
                    return (
                      <div
                        key={cmd.id}
                        onClick={cmd.action}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          height: '36px',
                          padding: '0 12px',
                          margin: '2px 8px',
                          borderRadius: '8px',
                          backgroundColor: isSelected ? '#f2f2f7' : 'transparent',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            minWidth: 0
                          }}
                        >
                          {cmd.id === 'cmd-new' ? (
                            <Plus size={16} color="#6e6e73" />
                          ) : cmd.id === 'cmd-project' ? (
                            <Folder size={16} color="#6e6e73" />
                          ) : (
                            <Sparkles size={16} color="#6e6e73" />
                          )}
                          <span
                            style={{
                              fontSize: '13px',
                              color: '#1c1c1e',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {cmd.label}
                          </span>
                        </div>

                        {cmd.shortcut && (
                          <span
                            style={{
                              fontSize: '11px',
                              color: '#8e8e93',
                              backgroundColor: '#e8e8ed',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontFamily: '-apple-system, BlinkMacSystemFont, monospace'
                            }}
                          >
                            {cmd.shortcut}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Linkcode CommandFooter Bar */}
        <div
          style={{
            height: '36px',
            padding: '0 16px',
            backgroundColor: '#fafafa',
            borderTop: '1px solid #f0f0f2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#8e8e93',
            userSelect: 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span
                style={{
                  padding: '1px 4px',
                  backgroundColor: '#e8e8ed',
                  borderRadius: '3px',
                  color: '#555',
                  display: 'inline-flex'
                }}
              >
                <ArrowUp size={10} />
              </span>
              <span
                style={{
                  padding: '1px 4px',
                  backgroundColor: '#e8e8ed',
                  borderRadius: '3px',
                  color: '#555',
                  display: 'inline-flex'
                }}
              >
                <ArrowDown size={10} />
              </span>
              <span>导航</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span
                style={{
                  padding: '1px 5px',
                  backgroundColor: '#e8e8ed',
                  borderRadius: '3px',
                  color: '#555',
                  display: 'inline-flex'
                }}
              >
                <CornerDownLeft size={10} />
              </span>
              <span>打开</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              style={{
                padding: '1px 5px',
                backgroundColor: '#e8e8ed',
                borderRadius: '3px',
                color: '#555',
                fontSize: '10px'
              }}
            >
              Esc
            </span>
            <span>关闭</span>
          </div>
        </div>
      </div>
    </div>
  )
}
