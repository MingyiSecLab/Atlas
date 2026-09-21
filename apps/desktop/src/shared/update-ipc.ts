export const UPDATE_IPC = {
  check: 'update:check',
  getStatus: 'update:get-status',
  stateChanged: 'update:state-changed',
  openRelease: 'update:open-release'
} as const

/**
 * 客户端更新检查状态。
 *
 * 发布形态是「引导下载」而非静默自更新：macOS 产物未签名未公证，
 * electron-updater 的依赖、publish 配置、latest.yml 产物三项均不具备，
 * 因此这里只负责发现新版本并跳转到 Release 页。
 */
export type UpdateStatus =
  /** 尚未检查过（首次启动且未触发检查） */
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date'; currentVersion: string }
  | {
      state: 'available'
      currentVersion: string
      latestVersion: string
      releaseUrl: string
      publishedAt: string
      /** Release notes 截断后的纯文本摘要 */
      notesSnippet: string
    }
  /** 网络不可达、GitHub API 异常或版本号无法解析 */
  | { state: 'unavailable'; reason?: string }

export interface UpdateBridge {
  /** 主动检查更新；失败不抛出，以 unavailable 状态返回。 */
  check(): Promise<UpdateStatus>
  /** 读取主进程缓存的最近一次状态（渲染层挂载时拉一次）。 */
  getStatus(): Promise<UpdateStatus>
  /** 状态变化推送；返回取消订阅函数。 */
  onStateChanged(listener: (status: UpdateStatus) => void): () => void
  /** 用系统浏览器打开 Release 页（主进程校验域名前缀）。 */
  openRelease(url: string): Promise<void>
}
