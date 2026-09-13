import { app, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerProviderService } from './provider-service'
import { registerPentestService } from './pentest-service'
import { DesktopRuntimeManager } from './runtime-manager'
import { registerRuntimeService } from './runtime-service'
import { registerTerminalService, watchTerminalOwner } from './terminal-service'
import { registerFileService } from './file-service'
import { registerEnvironmentService } from './environment-service'

let disposeTerminalService = (): void => undefined
let disposeProviderService = (): void => undefined
let disposeRuntimeService = (): void => undefined
let disposePentestService = (): void => undefined
let disposeFileService = (): void => undefined
let disposeEnvironmentService = (): void => undefined
const runtimeManager = new DesktopRuntimeManager(process.env.MINGYI_WORKSPACE_PATH)
let shutdownStarted = false
let servicesStopped = false

async function shutdownServices(): Promise<void> {
  disposeEnvironmentService()
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

    disposeTerminalService = registerTerminalService()
    disposeProviderService = registerProviderService(runtimeManager)
    disposeRuntimeService = registerRuntimeService(runtimeManager)
    disposePentestService = registerPentestService(runtimeManager)
    disposeFileService = registerFileService(runtimeManager)
    disposeEnvironmentService = registerEnvironmentService(runtimeManager)

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
