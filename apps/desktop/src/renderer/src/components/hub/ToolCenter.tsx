import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  CircleAlert,
  Edit3,
  ExternalLink,
  MoreHorizontal,
  Play,
  Plus,
  Power,
  Server,
  Settings,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react'
import type { RuntimeMcpProjectConfig, RuntimeMcpServer } from '@mingyi/runtime'
import type { BuiltinConnector, ToolItem } from './hub-types'
import { BUILTIN_CONNECTORS } from './hub-data'
import { ConnectorConfigModal } from './ConnectorConfigModal'

interface ToolCenterProps {
  tools?: ToolItem[]
  searchQuery: string
  openConfigRequest?: number
  onTryConnector?: (connectorName: string) => void
}
function statusText(server: RuntimeMcpServer): string {
  if (server.status.disabled) return '已禁用'
  if (server.status.connecting) return '连接中'
  if (server.status.connected) return '已连接'
  return '连接失败'
}

export const ToolCenter: React.FC<ToolCenterProps> = ({
  searchQuery,
  openConfigRequest,
  onTryConnector
}) => {
  const [builtinConnectors, setBuiltinConnectors] = useState<BuiltinConnector[]>(BUILTIN_CONNECTORS)
  const [servers, setServers] = useState<RuntimeMcpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<RuntimeMcpServer | null>(null)
  const [busyName, setBusyName] = useState<string | null>(null)
  const [menuOpenConnectorId, setMenuOpenConnectorId] = useState<string | null>(null)
  const [configuringConnector, setConfiguringConnector] = useState<BuiltinConnector | null>(null)

  useEffect(() => {
    const handleWindowClick = (): void => {
      setMenuOpenConnectorId(null)
    }
    window.addEventListener('click', handleWindowClick)
    return () => window.removeEventListener('click', handleWindowClick)
  }, [])

  const loadServers = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setServers(await window.api.mcp.list())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取 MCP Server 状态')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    const refresh = (): void => {
      void window.api.mcp
        .list()
        .then((items) => {
          if (active) setServers(items)
        })
        .catch((cause) => {
          if (active) setError(cause instanceof Error ? cause.message : '无法读取 MCP Server 状态')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }
    refresh()
    const timer = window.setInterval(refresh, 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!openConfigRequest) return
    const timer = window.setTimeout(() => setShowForm(true), 0)
    return () => window.clearTimeout(timer)
  }, [openConfigRequest])
  const query = searchQuery.trim().toLowerCase()
  const filteredBuiltinConnectors = useMemo(() => {
    if (!query) return builtinConnectors
    return builtinConnectors.filter((connector) =>
      [
        connector.name,
        connector.identifier,
        connector.description,
        connector.transport,
        ...connector.tags,
        ...connector.tools
      ].some((val) => val.toLowerCase().includes(query))
    )
  }, [query, builtinConnectors])

  const filteredServers = useMemo(
    () =>
      servers.filter((server) => {
        if (!query) return true
        return [
          server.status.name,
          server.config.transport,
          server.config.command,
          server.config.url,
          ...server.status.toolNames
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query))
      }),
    [query, servers]
  )

  const run = async (name: string, action: () => Promise<unknown>): Promise<void> => {
    setBusyName(name)
    try {
      await action()
      await loadServers()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'MCP 操作失败')
    } finally {
      setBusyName(null)
    }
  }

  const handleDelete = (name: string): void => {
    if (!window.confirm(`确定删除 MCP Server “${name}”吗？`)) return
    void run(name, () => window.api.mcp.remove(name))
  }

  const totalCount = filteredBuiltinConnectors.length + filteredServers.length

  return (
    <div className="hub-list-container">
      {error && (
        <div className="hub-mcp-error">
          <CircleAlert size={14} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="hub-inset-list">
          <div className="hub-empty-list">正在读取连接器...</div>
        </div>
      ) : totalCount === 0 ? (
        <div className="hub-inset-list">
          <div className="hub-empty-list">未搜索到匹配的连接器</div>
        </div>
      ) : (
        <div className="connector-card-grid">
          {/* 内置连接器 (网站安全监测等) */}
          {filteredBuiltinConnectors.map((connector) => {
            const enabled = !connector.status.disabled
            return (
              <div
                className={`connector-card connector-card--builtin${enabled ? '' : ' is-disabled'}`}
                key={connector.id}
                onClick={() => setConfiguringConnector(connector)}
                title="点击配置连接器"
              >
                <div className="connector-card-icon">
                  {connector.logo ? (
                    <img src={connector.logo} alt="" />
                  ) : (
                    <ShieldCheck size={18} color="#0f766e" />
                  )}
                </div>
                <div className="connector-card-main">
                  <div className="connector-card-name-row">
                    <div className="connector-card-name">{connector.name}</div>
                    <span
                      className={`connector-card-status-dot connector-card-status-dot--${enabled ? 'connected' : 'disabled'}`}
                      title={enabled ? '已就绪' : '已禁用'}
                    />
                    <span className="connector-card-badge">
                      {connector.status.toolCount} 个工具
                    </span>
                  </div>
                  <div className="connector-card-desc">{connector.description}</div>
                </div>
                <div className="connector-card-action" onClick={(e) => e.stopPropagation()}>
                  {!enabled ? (
                    <button
                      type="button"
                      className="connector-connect-btn"
                      title="点击启用连接器"
                      onClick={() => {
                        setBuiltinConnectors((prev) =>
                          prev.map((item) =>
                            item.id === connector.id
                              ? {
                                  ...item,
                                  status: {
                                    ...item.status,
                                    disabled: false
                                  }
                                }
                              : item
                          )
                        )
                      }}
                    >
                      <Plus size={14} />
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="connector-connect-btn connector-connect-btn--try"
                        title="在对话中试一试"
                        onClick={() => onTryConnector?.(connector.name)}
                      >
                        <Play size={11} fill="currentColor" />
                      </button>

                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          className={`skill-card-menu-btn${menuOpenConnectorId === connector.id ? ' is-open' : ''}`}
                          title="更多操作"
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuOpenConnectorId((prev) =>
                              prev === connector.id ? null : connector.id
                            )
                          }}
                        >
                          <MoreHorizontal size={14} />
                        </button>

                        {menuOpenConnectorId === connector.id && (
                          <div className="skill-card-menu">
                            <div
                              className="skill-card-menu-item"
                              onClick={() => {
                                setMenuOpenConnectorId(null)
                                onTryConnector?.(connector.name)
                              }}
                            >
                              <Play size={12} fill="currentColor" />
                              <span>试一试</span>
                            </div>
                            <div
                              className="skill-card-menu-item"
                              onClick={() => {
                                setMenuOpenConnectorId(null)
                                setConfiguringConnector(connector)
                              }}
                            >
                              <Settings size={12} />
                              <span>配置连接器</span>
                            </div>
                            <div
                              className="skill-card-menu-item"
                              onClick={() => {
                                setMenuOpenConnectorId(null)
                                setBuiltinConnectors((prev) =>
                                  prev.map((item) =>
                                    item.id === connector.id
                                      ? {
                                          ...item,
                                          status: {
                                            ...item.status,
                                            disabled: true
                                          }
                                        }
                                      : item
                                  )
                                )
                              }}
                            >
                              <Power size={12} />
                              <span>禁用连接器</span>
                            </div>
                            <div
                              className="skill-card-menu-item skill-card-menu-item--danger"
                              onClick={() => {
                                setMenuOpenConnectorId(null)
                                setBuiltinConnectors((prev) =>
                                  prev.map((item) =>
                                    item.id === connector.id
                                      ? {
                                          ...item,
                                          status: {
                                            ...item.status,
                                            disabled: true
                                          }
                                        }
                                      : item
                                  )
                                )
                              }}
                            >
                              <Trash2 size={12} />
                              <span>卸载连接器</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}

          {/* 自定义 MCP 连接器 */}
          {filteredServers.map((server) => {
            const busy = busyName === server.status.name
            const enabled = !server.status.disabled
            return (
              <div
                className={`connector-card connector-card--mcp${enabled ? '' : ' is-disabled'}`}
                key={server.status.name}
              >
                <div className="connector-card-icon" style={{ background: '#f4f4f5' }}>
                  <Server size={17} color="#52525b" />
                </div>
                <div className="connector-card-main">
                  <div className="connector-card-name-row">
                    <div className="connector-card-name">{server.status.name}</div>
                    <span
                      className={`connector-card-status-dot connector-card-status-dot--${server.status.connected ? 'connected' : server.status.disabled ? 'disabled' : 'error'}`}
                      title={statusText(server)}
                    />
                    <span className="connector-card-badge">{server.status.toolCount} 个工具</span>
                  </div>
                  <div className="connector-card-desc">
                    {server.status.error ||
                      (server.config.transport === 'stdio'
                        ? server.config.command
                        : server.config.url) ||
                      '外部 MCP 连接器服务'}
                  </div>
                </div>
                <div className="connector-card-action" onClick={(e) => e.stopPropagation()}>
                  {server.status.needsAuth && enabled && (
                    <button
                      type="button"
                      className="connector-connect-btn"
                      title="OAuth 授权"
                      disabled={busy}
                      onClick={() =>
                        void run(server.status.name, () =>
                          window.api.mcp.authenticate(server.status.name)
                        )
                      }
                    >
                      <ExternalLink size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="connector-connect-btn"
                    title="编辑配置"
                    disabled={busy}
                    onClick={() => {
                      setEditing(server)
                      setShowForm(true)
                    }}
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    type="button"
                    className="connector-connect-btn"
                    title="删除"
                    disabled={busy}
                    onClick={() => handleDelete(server.status.name)}
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    type="button"
                    className={`connector-connect-btn${enabled ? ' is-active' : ''}`}
                    title={enabled ? '已启用（点击禁用）' : '已禁用（点击启用）'}
                    disabled={busy}
                    onClick={() =>
                      void run(server.status.name, () =>
                        window.api.mcp.setDisabled(server.status.name, enabled)
                      )
                    }
                  >
                    {enabled ? <Check size={14} /> : <Plus size={14} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {showForm && (
        <McpServerForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            void loadServers()
          }}
        />
      )}

      <ConnectorConfigModal
        connector={configuringConnector}
        isOpen={configuringConnector !== null}
        onClose={() => setConfiguringConnector(null)}
      />
    </div>
  )
}

interface McpServerFormProps {
  initial: RuntimeMcpServer | null
  onClose: () => void
  onSaved: () => void
}

const McpServerForm: React.FC<McpServerFormProps> = ({ onClose, onSaved }) => {
  const [configText, setConfigText] = useState('{\n  "mcpServers": {}\n}')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void window.api.mcp
      .getProjectConfig()
      .then((config) => {
        if (active) setConfigText(JSON.stringify(config, null, 2))
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : '无法读取 MCP 配置')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    let config: RuntimeMcpProjectConfig
    try {
      const parsed: unknown = JSON.parse(configText)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('配置必须是 JSON 对象。')
      }
      config = parsed as RuntimeMcpProjectConfig
      if (
        !config.mcpServers ||
        typeof config.mcpServers !== 'object' ||
        Array.isArray(config.mcpServers)
      ) {
        throw new Error('配置必须包含 mcpServers 对象。')
      }
    } catch (cause) {
      return setError(cause instanceof Error ? cause.message : 'JSON 配置格式错误。')
    }
    setSaving(true)
    try {
      await window.api.mcp.replaceProjectConfig(config)
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="hub-mcp-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form className="hub-mcp-modal" onSubmit={(event) => void submit(event)}>
        <div className="hub-mcp-modal-header">
          <div>
            <h2>编辑 MCP 配置</h2>
            <p>使用 Mastra Code SDK 的通用 mcpServers JSON 格式，保存到当前 workspace。</p>
          </div>
          <button type="button" className="hub-icon-btn" onClick={onClose} title="关闭">
            <X size={16} />
          </button>
        </div>
        <label>
          MCP 配置 JSON
          <textarea
            className="hub-mcp-config-editor"
            value={configText}
            onChange={(event) => setConfigText(event.target.value)}
            disabled={loading || saving}
            spellCheck={false}
            placeholder={
              '{\n  "mcpServers": {\n    "filesystem": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]\n    }\n  }\n}'
            }
          />
        </label>
        {error && <div className="hub-mcp-form-error">{error}</div>}
        <div className="hub-mcp-modal-actions">
          <button type="button" className="hub-header-action-btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="hub-header-action-btn hub-mcp-primary" disabled={saving}>
            {saving ? '保存中...' : '保存并连接'}
          </button>
        </div>
      </form>
    </div>
  )
}
