import React, { useCallback, useState } from 'react'
import { Download, Info, RefreshCw, Search } from 'lucide-react'
import { SettingsPageLayout } from '../../components/settings-controls'
import { useUpdateStatus } from '@renderer/state/use-update-status'
import type { UpdateStatus } from '../../../../../../../shared/update-ipc'

/** 与侧栏版本号同源：构建期由 electron.vite.config.ts 从 apps/desktop/package.json 注入。 */
const CURRENT_VERSION = __APP_VERSION__

/** 主进程回传的版本号不带 v 前缀（app.getVersion()），展示时补齐。 */
function displayVersion(value: string): string {
  return value.startsWith('v') ? value : `v${value}`
}

function formatPublishedAt(value: string): string {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return ''
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

function statusSummary(status: UpdateStatus): string {
  switch (status.state) {
    case 'idle':
      return '尚未检查更新。'
    case 'checking':
      return '正在检查更新…'
    case 'up-to-date':
      return `已是最新版本（${displayVersion(status.currentVersion)}）。`
    case 'available':
      return `发现新版本 ${displayVersion(status.latestVersion)}，当前版本 ${displayVersion(status.currentVersion)}。`
    case 'unavailable':
      return status.reason ? `检查更新失败：${status.reason}` : '检查更新失败：网络不可用。'
  }
}

export const AboutSettingsPage: React.FC = () => {
  const pushedStatus = useUpdateStatus()
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  // 状态一律来自主进程推送；只有 IPC 本身失败时用本地错误兜底，避免按钮点了没反应
  const status: UpdateStatus = checkError
    ? { state: 'unavailable', reason: checkError }
    : pushedStatus

  const handleCheck = useCallback(async (): Promise<void> => {
    setChecking(true)
    setCheckError(null)
    try {
      await window.api.update.check()
    } catch (error) {
      setCheckError(error instanceof Error ? error.message : String(error))
    } finally {
      setChecking(false)
    }
  }, [])

  const handleOpenRelease = useCallback((url: string): void => {
    void window.api.update.openRelease(url).catch(() => undefined)
  }, [])

  return (
    <SettingsPageLayout label="关于与更新">
      <div className="about-header">
        <div className="about-header-icon">
          <Info size={16} />
        </div>
        <div className="about-header-content">
          <h2>关于与更新</h2>
          <p>查看当前版本、检查是否有新版本，并前往下载安装包。</p>
        </div>
      </div>

      <section className="settings-section">
        <div className="settings-section-heading">
          <h2>版本信息</h2>
          <p>版本号与安装包命名、Release tag 同源（apps/desktop/package.json）。</p>
        </div>
        <div className="about-facts">
          <div className="about-fact">
            <span className="about-fact-label">当前版本</span>
            <span className="about-fact-value">{CURRENT_VERSION}</span>
          </div>
          <div className="about-fact">
            <span className="about-fact-label">构建提交</span>
            <span className="about-fact-value">{__BUILD_COMMIT__ || '本地构建'}</span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading">
          <h2>更新</h2>
          <p>启动后会自动检查一次；也可随时手动检查。</p>
        </div>
        <div className="about-update">
          <div className={`about-status is-${status.state}`}>
            <span className="about-status-text">{statusSummary(status)}</span>
            {status.state === 'available' && status.publishedAt && (
              <span className="about-status-meta">
                发布于 {formatPublishedAt(status.publishedAt)}
              </span>
            )}
          </div>

          {status.state === 'available' && status.notesSnippet && (
            <pre className="about-notes">{status.notesSnippet}</pre>
          )}

          <div className="about-actions">
            <button
              className="settings-secondary-button"
              type="button"
              disabled={checking}
              onClick={() => void handleCheck()}
            >
              {checking ? (
                <RefreshCw size={13} className="about-spin" aria-hidden="true" />
              ) : (
                <Search size={13} aria-hidden="true" />
              )}
              <span>{checking ? '检查中…' : '检查更新'}</span>
            </button>
            {status.state === 'available' && (
              <button
                className="settings-primary-button"
                type="button"
                onClick={() => handleOpenRelease(status.releaseUrl)}
              >
                <Download size={13} aria-hidden="true" />
                <span>前往下载</span>
              </button>
            )}
          </div>
        </div>
      </section>
    </SettingsPageLayout>
  )
}
