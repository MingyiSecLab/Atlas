import React, { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  LoaderCircle,
  Play,
  RefreshCw,
  Square
} from 'lucide-react'
import type { EnvironmentCheckResult } from '../../../../../../../shared/environment-ipc'
import {
  SettingsPageLayout,
  SettingsRow,
  SettingsSection
} from '../../components/settings-controls'

export const EnvironmentSettingsPage: React.FC = () => {
  const [data, setData] = useState<EnvironmentCheckResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [operatingContainer, setOperatingContainer] = useState<'starting' | 'stopping' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [containerError, setContainerError] = useState<string | null>(null)
  const [lastCheckedText, setLastCheckedText] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCheck = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)
      const res = await window.api.environment.check()
      setData(res)
      const time = new Date(res.checkedAt).toLocaleTimeString()
      setLastCheckedText(time)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    const runInitCheck = async (): Promise<void> => {
      try {
        setLoading(true)
        const res = await window.api.environment.check()
        if (active) {
          setData(res)
          setLastCheckedText(new Date(res.checkedAt).toLocaleTimeString())
        }
      } catch (err: unknown) {
        if (active) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    void runInitCheck()
    return () => {
      active = false
    }
  }, [])

  const handleStartSandbox = async (): Promise<void> => {
    try {
      setOperatingContainer('starting')
      setContainerError(null)
      setError(null)
      const res = await window.api.environment.startSandbox()
      if (!res.ok) {
        setContainerError(res.error || '启动沙箱容器失败，请检查 Docker 状态')
      } else {
        await handleCheck()
      }
    } catch (err: unknown) {
      setContainerError(err instanceof Error ? err.message : String(err))
    } finally {
      setOperatingContainer(null)
    }
  }

  const handleStopSandbox = async (): Promise<void> => {
    try {
      setOperatingContainer('stopping')
      setContainerError(null)
      const res = await window.api.environment.stopSandbox()
      if (!res.ok) {
        setContainerError(res.error || '停止沙箱容器失败')
      } else {
        await handleCheck()
      }
    } catch (err: unknown) {
      setContainerError(err instanceof Error ? err.message : String(err))
    } finally {
      setOperatingContainer(null)
    }
  }

  const handleCopyError = (text: string): void => {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const host = data?.host
  const docker = data?.docker
  const image = data?.sandboxImage
  const container = data?.sandboxContainer
  const tools = data?.tools || []

  return (
    <SettingsPageLayout label="环境状态">
      {/* 顶部标题栏与 macOS 风格操作按钮 */}
      <div className="env-header-row">
        <div className="env-header-text">
          <h2>环境状态</h2>
          <p>查看操作系统宿主、Docker 服务及 Kali 安全沙箱工具链运行状态。</p>
        </div>
        <div className="env-header-controls">
          {lastCheckedText && <span className="env-time-label">上次检查 {lastCheckedText}</span>}
          <button
            type="button"
            className="env-mac-button"
            disabled={loading || operatingContainer !== null}
            onClick={() => void handleCheck()}
          >
            {loading ? <LoaderCircle size={13} className="spin-icon" /> : <RefreshCw size={13} />}
            <span>检查环境状态</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="env-error-note">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* 第一组：宿主与容器环境（macOS 偏好设置风格的 Inset Grouped Rows） */}
      <SettingsSection
        title="运行环境与沙箱"
        description="宿主机操作系统平台、Docker 引擎连通性与沙箱容器实例状态"
      >
        <SettingsRow
          title="宿主操作系统"
          description={host ? `${host.osName} · ${host.arch}` : '正在识别操作系统平台...'}
        >
          {host ? (
            <span className="mac-tag">{host.platform.toUpperCase()}</span>
          ) : (
            <span className="mac-subtext">检测中</span>
          )}
        </SettingsRow>

        <SettingsRow
          title="Docker 引擎"
          description={
            docker
              ? docker.running
                ? `可执行路径: ${docker.executablePath || 'docker'}`
                : docker.suggestion || docker.error || '守护进程未运行'
              : '正在连接 Docker 守护进程...'
          }
        >
          {docker ? (
            <div className="mac-status-indicator">
              <span
                className={`mac-dot ${docker.running ? 'is-green' : docker.installed ? 'is-amber' : 'is-red'}`}
              />
              <span className="mac-status-label">
                {docker.running
                  ? `运行中 (${docker.version})`
                  : docker.installed
                    ? '未启动'
                    : '未安装'}
              </span>
            </div>
          ) : (
            <span className="mac-subtext">检测中</span>
          )}
        </SettingsRow>

        <SettingsRow
          title="沙箱镜像"
          description={
            image
              ? image.exists
                ? `大小: ${image.sizeHuman || '已就绪'} · 架构: ${image.architecture} ${image.isArchitectureMatch ? '✓' : '(兼容层)'}`
                : '未检出 mingyi-sandbox:latest，请执行 npm run container:build 编译'
              : '正在检索镜像...'
          }
        >
          {image ? (
            <div className="mac-status-indicator">
              <span className={`mac-dot ${image.exists ? 'is-green' : 'is-red'}`} />
              <span className="mac-status-label">{image.exists ? '已就绪' : '镜像缺失'}</span>
            </div>
          ) : (
            <span className="mac-subtext">检测中</span>
          )}
        </SettingsRow>

        <SettingsRow
          title="沙箱容器实例"
          description={
            container
              ? `名称: ${container.containerName} · ${container.hasNetCaps ? '网络权限: NET_RAW / NET_ADMIN' : '标准权限'}`
              : '正在检查沙箱常驻容器...'
          }
        >
          {container ? (
            <div className="mac-container-action-group">
              <div className="mac-status-indicator">
                <span
                  className={`mac-dot ${container.running ? 'is-green' : container.exists ? 'is-amber' : 'is-gray'}`}
                />
                <span className="mac-status-label">
                  {container.running ? '运行中' : container.exists ? '已停止' : '未拉起'}
                </span>
              </div>
              {container.running ? (
                <button
                  type="button"
                  className="env-mac-button is-compact"
                  disabled={operatingContainer !== null || loading}
                  onClick={() => void handleStopSandbox()}
                >
                  {operatingContainer === 'stopping' ? (
                    <LoaderCircle size={12} className="spin-icon" />
                  ) : (
                    <Square size={11} />
                  )}
                  <span>{operatingContainer === 'stopping' ? '正在停止...' : '停止'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="env-mac-button is-compact is-primary-action"
                  disabled={operatingContainer !== null || loading || !image?.exists}
                  onClick={() => void handleStartSandbox()}
                >
                  {operatingContainer === 'starting' ? (
                    <LoaderCircle size={12} className="spin-icon" />
                  ) : (
                    <Play size={11} />
                  )}
                  <span>{operatingContainer === 'starting' ? '正在启动...' : '启动沙箱'}</span>
                </button>
              )}
            </div>
          ) : (
            <span className="mac-subtext">检测中</span>
          )}
        </SettingsRow>

        {/* 若启动或操作容器出错，直接在下方呈现高对比度排查信息 */}
        {containerError && (
          <div className="mac-inline-error-card">
            <div className="mac-inline-error-header">
              <div className="mac-inline-error-title">
                <AlertCircle size={13} />
                <span>容器启动失败原因:</span>
              </div>
              <button
                type="button"
                className="mac-copy-btn"
                onClick={() => handleCopyError(containerError)}
              >
                {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                <span>{copied ? '已复制' : '复制错误'}</span>
              </button>
            </div>
            <div className="mac-inline-error-body">{containerError}</div>
          </div>
        )}
      </SettingsSection>

      {/* 第二组：渗透工具链探活矩阵 */}
      <SettingsSection
        title="安全工具链状态"
        description="Kali 沙箱内置的网络扫描、爬虫分析、漏洞利用及离线 PoC / Payloads 知识库"
      >
        {tools.length === 0 ? (
          <div className="mac-empty-state">
            {image?.exists
              ? '点击上方“检查环境状态”即可开始全面探活抽检。'
              : '请先编译并就绪 mingyi-sandbox:latest 镜像。'}
          </div>
        ) : (
          <div className="mac-tools-group">
            {tools.map((tool) => (
              <div key={tool.id} className="mac-tool-item">
                <div className="mac-tool-main">
                  <div className="mac-tool-title-row">
                    <span className="mac-tool-name">{tool.name}</span>
                  </div>
                  {(tool.detail || tool.error) && (
                    <div className="mac-tool-desc">
                      {tool.error ? (
                        <span className="mac-desc-err">{tool.error}</span>
                      ) : (
                        tool.detail
                      )}
                    </div>
                  )}
                </div>
                <div className="mac-tool-meta">
                  {tool.version && <span className="mac-version-pill">{tool.version}</span>}
                  <div className="mac-status-indicator">
                    <span className={`mac-dot ${tool.available ? 'is-green' : 'is-red'}`} />
                    <span className="mac-status-label">{tool.available ? '正常' : '异常'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>
    </SettingsPageLayout>
  )
}
