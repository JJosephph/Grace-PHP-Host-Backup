import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AppConfig,
  BrowseRequest,
  LogEntry,
  OperationStatus,
  StartTransferRequest
} from '../shared/types'
import { loadConfig, saveConfig } from './config'
import { FtpService } from './ftp'
import { checkForUpdate } from './updater'

let mainWindow: BrowserWindow | null = null
let ftpService: FtpService | null = null

function send(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function createService(): FtpService {
  return new FtpService(
    (level, message) => {
      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        time: new Date().toISOString(),
        level,
        message
      }
      send('grace:log', entry)
    },
    (status: OperationStatus) => send('grace:status', status),
    (progress) => send('grace:scan-progress', progress),
    (progress) => send('grace:transfer-progress', progress)
  )
}

function registerIpc(): void {
  ipcMain.handle('grace:config:load', () => loadConfig())
  ipcMain.handle('grace:config:save', (_event, config: AppConfig) => saveConfig(config))
  ipcMain.handle('grace:update:check', () => checkForUpdate())

  ipcMain.handle(
    'grace:choose-directory',
    async (_event, defaultPath?: string): Promise<string | null> => {
      const options: Electron.OpenDialogOptions = {
        title: '选择本地目录',
        defaultPath: defaultPath && existsSync(defaultPath) ? defaultPath : app.getPath('home'),
        properties: ['openDirectory', 'createDirectory']
      }
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options)
      return result.canceled ? null : result.filePaths[0] ?? null
    }
  )

  ipcMain.handle('grace:test-connection', (_event, config: AppConfig) =>
    ftpService?.testConnection(config)
  )

  ipcMain.handle('grace:browse-remote', (_event, request: BrowseRequest) =>
    ftpService?.browseRemote(request.config, request.path)
  )

  ipcMain.handle('grace:browse-local', (_event, path: string) =>
    ftpService?.browseLocal(path)
  )

  ipcMain.handle('grace:transfer:start', (_event, request: StartTransferRequest) => {
    if (!ftpService) throw new Error('FTP 服务尚未就绪。')
    return ftpService.startTransfer(request.mode, request.config, request.localRoot)
  })

  ipcMain.handle('grace:transfer:cancel', () => ftpService?.cancelTransfer())
  ipcMain.handle('grace:transfer:pause', () => ftpService?.pauseTransfer())
  ipcMain.handle('grace:transfer:resume', () => ftpService?.resumeTransfer())

  ipcMain.handle('grace:open-path', async (_event, path: string) => {
    if (!path || !existsSync(path)) throw new Error('目录不存在。')
    const result = await shell.openPath(path)
    if (result) throw new Error(result)
  })

  ipcMain.handle('grace:reveal-path', (_event, path: string) => {
    if (!path || !existsSync(path)) throw new Error('文件或目录不存在。')
    shell.showItemInFolder(path)
  })

  ipcMain.handle('grace:open-external', async (_event, url: string) => {
    if (!/^https:\/\//i.test(url)) throw new Error('只允许打开 HTTPS 链接。')
    await shell.openExternal(url)
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#07090d',
    title: '恩典 PHP 主机一键备份',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('site.ainav.grace-backup')
  Menu.setApplicationMenu(null)
  ftpService = createService()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  ftpService?.disconnect()
})
