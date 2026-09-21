import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { UPDATE_IPC, type UpdateStatus } from '../shared/update-ipc'

/**
 * 客户端更新检测。
 *
 * 发布仓库与 Release 页固定为 MingyiSecLab/Atlas：GitHub 的
 * `GET /repos/{owner}/{repo}/releases/latest` 是公开只读接口（无需认证，
 * 未认证配额 60 次/小时/IP），返回最新 Release 的 tag、发布时间与正文，
 * 客户端据此与本地 `app.getVersion()` 比对即可发现新版本。
 *
 * 本服务只做「发现 + 引导下载」，不做静默自更新：macOS 产物未签名未公证，
 * electron-updater 所需的依赖、`publish` 配置、Release 中的 latest.yml
 * 三项均不具备，且未签名应用即使下载完成也无法通过 Gatekeeper。
 */
const RELEASES_API = 'https://api.github.com/repos/MingyiSecLab/Atlas/releases/latest'
const RELEASES_PAGE = 'https://github.com/MingyiSecLab/Atlas/releases'
const RELEASES_ORIGIN = 'https://github.com'
const REQUEST_TIMEOUT_MS = 10_000
/** 启动后台检查的延迟：让首屏渲染与其他启动任务先完成，检查结果不阻塞任何交互。 */
const STARTUP_CHECK_DELAY_MS = 3_000
const NOTES_SNIPPET_LIMIT = 500
const USER_AGENT = 'Atlas-Desktop'
const DISABLED_REASON = '更新检查已禁用（MINGYI_DISABLE_UPDATE_CHECK）。'

interface LatestRelease {
  tagName: string
  url: string
  publishedAt: string
  body: string
}

interface ParsedVersion {
  core: number[]
  prerelease: string[]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 测试与隐私场景可整体关停检查（含启动自动检查）。 */
function updateCheckDisabled(): boolean {
  const value = process.env.MINGYI_DISABLE_UPDATE_CHECK?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, '')
}

function parseVersion(raw: string): ParsedVersion | null {
  // 忽略 build metadata（+ 之后），预发布段按 semver 用 . 分隔标识符
  const withoutBuild = normalizeVersion(raw).split('+')[0]
  if (!withoutBuild) return null

  const [corePart, ...prereleaseParts] = withoutBuild.split('-')
  const core: number[] = []
  for (const segment of corePart.split('.')) {
    if (!/^\d+$/.test(segment)) return null
    core.push(Number(segment))
  }
  if (core.length === 0) return null

  return {
    core,
    prerelease: prereleaseParts
      .join('-')
      .split('.')
      .filter((identifier) => identifier.length > 0)
  }
}

/**
 * 语义化版本比较：a > b 返回 1，a < b 返回 0 以下，相等返回 0；
 * 任一侧无法解析时返回 null（调用方按「无法判定」处理，不臆断有更新）。
 *
 * 规则与 semver 一致：主/次/修订逐段数值比较，缺位视为 0；
 * 正式版大于同版本号预发布版；预发布标识符逐段比较，数字段按数值、
 * 数字段小于字母段，前缀相同则标识符多者更大。
 */
export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return null

  const coreLength = Math.max(left.core.length, right.core.length)
  for (let index = 0; index < coreLength; index += 1) {
    const diff = (left.core[index] ?? 0) - (right.core[index] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }

  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0
  if (left.prerelease.length === 0) return 1
  if (right.prerelease.length === 0) return -1

  const prereleaseLength = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < prereleaseLength; index += 1) {
    const leftId = left.prerelease[index]
    const rightId = right.prerelease[index]
    if (leftId === undefined) return -1
    if (rightId === undefined) return 1
    if (leftId === rightId) continue

    const leftNumeric = /^\d+$/.test(leftId)
    const rightNumeric = /^\d+$/.test(rightId)
    if (leftNumeric && rightNumeric) return Number(leftId) > Number(rightId) ? 1 : -1
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return leftId > rightId ? 1 : -1
  }
  return 0
}

function notesSnippet(body: string): string {
  const text = body.replace(/\r\n/g, '\n').trim()
  return text.length > NOTES_SNIPPET_LIMIT ? `${text.slice(0, NOTES_SNIPPET_LIMIT)}…` : text
}

async function fetchLatestRelease(signal: AbortSignal): Promise<LatestRelease | null> {
  const response = await fetch(RELEASES_API, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': USER_AGENT },
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
  })
  // 尚无正式 Release（仓库刚建立或只有 draft）时 GitHub 返回 404：按「已是最新」处理，
  // 不向用户暴露为错误
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GitHub API 返回 HTTP ${response.status}`)

  const payload = (await response.json()) as Record<string, unknown>
  const tagName = typeof payload.tag_name === 'string' ? payload.tag_name.trim() : ''
  if (!tagName) throw new Error('GitHub Release 数据缺少 tag_name')

  return {
    tagName,
    url:
      typeof payload.html_url === 'string' && payload.html_url ? payload.html_url : RELEASES_PAGE,
    publishedAt: typeof payload.published_at === 'string' ? payload.published_at : '',
    body: typeof payload.body === 'string' ? payload.body : ''
  }
}

async function resolveStatus(signal: AbortSignal): Promise<UpdateStatus> {
  const currentVersion = app.getVersion()
  let release: LatestRelease | null
  try {
    release = await fetchLatestRelease(signal)
  } catch (error) {
    return { state: 'unavailable', reason: errorMessage(error) }
  }

  if (!release) return { state: 'up-to-date', currentVersion }

  const latestVersion = normalizeVersion(release.tagName)
  const order = compareVersions(currentVersion, latestVersion)
  // 版本号解析不了时宁可不说「有更新」：误报会引导用户去下载一个并不存在的版本
  if (order === null) return { state: 'unavailable', reason: `无法解析版本号：${release.tagName}` }
  if (order >= 0) return { state: 'up-to-date', currentVersion }

  return {
    state: 'available',
    currentVersion,
    latestVersion,
    releaseUrl: release.url,
    publishedAt: release.publishedAt,
    notesSnippet: notesSnippet(release.body)
  }
}

function releaseUrlAllowed(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith(RELEASES_PAGE)) return false
  try {
    // 前缀判断之外再锁一次 origin，避免任何形如 releases.evil.com 的构造
    return new URL(value).origin === RELEASES_ORIGIN
  } catch {
    return false
  }
}

export function registerUpdateService(): () => void {
  let lastStatus: UpdateStatus = { state: 'idle' }
  let inFlight: Promise<UpdateStatus> | null = null
  const controller = new AbortController()

  const publish = (status: UpdateStatus): UpdateStatus => {
    lastStatus = status
    for (const window of BrowserWindow.getAllWindows()) {
      const owner = window.webContents
      if (!owner.isDestroyed()) owner.send(UPDATE_IPC.stateChanged, status)
    }
    return status
  }

  const runCheck = (): Promise<UpdateStatus> => {
    if (updateCheckDisabled()) {
      return Promise.resolve(publish({ state: 'unavailable', reason: DISABLED_REASON }))
    }
    // 启动自动检查与手动点击可能撞在一起：复用同一次请求，避免重复打 GitHub 配额
    if (inFlight) return inFlight

    publish({ state: 'checking' })
    inFlight = resolveStatus(controller.signal)
      .then((status) => publish(status))
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  ipcMain.handle(UPDATE_IPC.check, () => runCheck())
  ipcMain.handle(UPDATE_IPC.getStatus, () => lastStatus)
  ipcMain.handle(UPDATE_IPC.openRelease, async (_event, url: unknown) => {
    if (!releaseUrlAllowed(url)) throw new Error('Unsupported release URL.')
    await shell.openExternal(url)
  })

  let startupTimer: NodeJS.Timeout | null = null
  if (!updateCheckDisabled()) {
    startupTimer = setTimeout(() => {
      startupTimer = null
      void runCheck()
    }, STARTUP_CHECK_DELAY_MS)
  }

  return () => {
    if (startupTimer) clearTimeout(startupTimer)
    startupTimer = null
    controller.abort()
    ipcMain.removeHandler(UPDATE_IPC.check)
    ipcMain.removeHandler(UPDATE_IPC.getStatus)
    ipcMain.removeHandler(UPDATE_IPC.openRelease)
  }
}
