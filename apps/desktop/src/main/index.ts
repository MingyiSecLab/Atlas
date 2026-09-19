import { app, shell, BrowserWindow } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerProviderService } from './provider-service'
import { registerPentestService } from './pentest-service'
import { DesktopRuntimeManager } from './runtime-manager'
import { registerRuntimeService } from './runtime-service'
import { registerTerminalService, watchTerminalOwner } from './terminal-service'
import { registerFileService } from './file-service'

// 应用级数据统一落盘 ~/.atlas（desktop 动态计算，无需 .env 配置）：
//   atlas.db（SQLite：任务/会话历史/消息流/状态机）、vectors.db（向量记忆与检索索引）、
//   observability.duckdb（Trace）、auth.json（Provider 凭证）、settings.json（全局设置）、
//   agents/（用户级专家）、projects/（项目登记）、blobs/（大文件分流）、
//   pentest/（engagement 快照 + 会话归属映射 desktop-bindings.json）。
// 以下均为 code-sdk 原生环境变量，必须在 runtime 首次 boot 之前设置；
// 用 ||= 保留外部显式设置（调试用途），正常使用零配置。
const atlasHome = join(homedir(), '.atlas')
process.env.MASTRA_APP_DATA_DIR ||= atlasHome
process.env.MASTRA_DB_PATH ||= join(atlasHome, 'atlas.db')
process.env.MASTRA_OBSERVABILITY_DB_PATH ||= join(atlasHome, 'observability.duckdb')

let disposeTerminalService = (): void => undefined
let disposeProviderService = (): void => undefined
let disposeRuntimeService = (): void => undefined
let disposePentestService = (): void => undefined
let disposeFileService = (): void => undefined
const defaultWorkspace = process.env.MINGYI_WORKSPACE_PATH || join(atlasHome, 'workspace')
const runtimeManager = new DesktopRuntimeManager(defaultWorkspace, atlasHome)
let shutdownStarted = false
let servicesStopped = false

async function shutdownServices(): Promise<void> {
  disposeFileService()
  disposeProviderService()
  disposeRuntimeService()
  disposePentestService()
  disposeTerminalService()
  try {
    await runtimeManager.shutdown()
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        level: 'error',
        processRole: 'electron-main',
        message: `Runtime shutdown failed: ${error instanceof Error ? error.message : String(error)}`
      })}\n`
    )
  }
}

// 自定义标题栏高度。必须与渲染层 TopHeader 的 height（42px）保持一致：
// Windows 下它同时作为 titleBarOverlay 的高度，让系统绘制的窗口按钮与顶栏对齐。
const WINDOW_TITLEBAR_HEIGHT = 42

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'
  const isLinux = process.platform === 'linux'

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    // 窗口外壳按平台展开差异项，公共配置只写一次（避免 if/else 复制两套窗口参数）：
    // - macOS：hiddenInset 保留原生红绿灯，trafficLightPosition 仅在 darwin 生效；
    // - Windows：无边框 + titleBarOverlay，窗口按钮仍由系统绘制，因此 Snap Layouts、
    //   系统右键菜单、高 DPI 缩放全部保留；按钮区宽度由渲染层读
    //   env(titlebar-area-*) 让位，不需要主进程回传像素值；
    // - Linux：维持系统原生边框（窗口装饰交给桌面环境），只补任务栏图标。
    ...(isMac && {
      titleBarStyle: 'hiddenInset' as const,
      trafficLightPosition: { x: 16, y: 15 }
    }),
    ...(isWindows && {
      frame: false,
      titleBarOverlay: {
        height: WINDOW_TITLEBAR_HEIGHT,
        color: '#00000000', // 透明，让渲染层顶栏背景透上来
        symbolColor: '#3f3f46' // 图标色跟随应用浅色主题；置灰避免在浅色顶栏上过曝
      }
    }),
    ...(isLinux && { icon }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true
    }
  })
  watchTerminalOwner(mainWindow.webContents)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app
  .whenReady()
  .then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    disposeTerminalService = registerTerminalService(join(atlasHome, 'blobs'))
    disposeProviderService = registerProviderService(runtimeManager)
    const pentestService = registerPentestService(runtimeManager)
    disposePentestService = () => pentestService.dispose()
    disposeRuntimeService = registerRuntimeService(runtimeManager, {
      // 会话删除后清理其 engagement 绑定，避免残留指向已删除会话的映射
      onSessionDeleted: (sessionId) => pentestService.removeTaskBindings(sessionId)
    })
    disposeFileService = registerFileService(runtimeManager)

    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(icon)
    }

    createWindow()

    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        level: 'error',
        processRole: 'electron-main',
        message: error instanceof Error ? error.message : String(error)
      })}\n`
    )
    shutdownStarted = true
    void shutdownServices().finally(() => app.exit(1))
  })

app.on('before-quit', (event) => {
  if (servicesStopped) return
  event.preventDefault()
  if (shutdownStarted) return
  shutdownStarted = true
  void shutdownServices().finally(() => {
    servicesStopped = true
    app.quit()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
