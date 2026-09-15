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
//   agents/（用户级专家）、projects/（项目登记）、blobs/（大文件分流）、pentest/（engagement 快照）。
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

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 15 },
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
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
    disposeRuntimeService = registerRuntimeService(runtimeManager)
    disposePentestService = registerPentestService(runtimeManager)
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
