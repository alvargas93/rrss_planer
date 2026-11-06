import { app, shell, BrowserWindow, dialog, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { configureUserDataPath, getDbPath, getMigrationsDir } from './paths'
import { openDatabase } from './db/client'
import { SqliteSettingsRepository } from './repositories/settings.repository'
import { SettingsService } from './services/settings.service'
import { registerAllIpc } from './ipc/register-all'
import { createLogger } from './log'

const log = createLogger('main')

// Debe ir antes de whenReady para que la carpeta de datos sea la correcta.
configureUserDataPath()

let mainWindow: BrowserWindow | null = null
let closeDb: (() => void) | null = null

function createWindow(settings: SettingsService): void {
  const theme = settings.get().appearance.theme
  const dark = theme === 'system' ? nativeTheme.shouldUseDarkColors : theme === 'dark'

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'RRSS Planner',
    // Color de fondo mientras carga, para evitar un destello blanco en modo oscuro.
    backgroundColor: dark ? '#0f1014' : '#f6f6f8',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Cualquier intento de abrir una ventana nueva va al navegador del sistema.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('https://')) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function bootstrap(): SettingsService {
  const { db, close } = openDatabase({ path: getDbPath(), migrationsFolder: getMigrationsDir() })
  closeDb = close
  const settings = new SettingsService(new SqliteSettingsRepository(db))
  registerAllIpc({ settings })
  return settings
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.vargas.rrssplanner')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  let settings: SettingsService
  try {
    settings = bootstrap()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('No se pudo iniciar la base de datos', message)
    dialog.showErrorBox(
      'RRSS Planner no puede arrancar',
      `No se pudo abrir la base de datos local.\n\n${message}\n\nRuta: ${getDbPath()}`
    )
    app.quit()
    return
  }

  createWindow(settings)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(settings)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  closeDb?.()
})
