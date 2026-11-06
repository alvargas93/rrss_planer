import { app, shell, BrowserWindow, dialog, nativeTheme, safeStorage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { configureUserDataPath, getDbPath, getMediaDir, getMigrationsDir } from './paths'
import { openDatabase } from './db/client'
import { SqliteSettingsRepository } from './repositories/settings.repository'
import { PillarsRepository } from './repositories/pillars.repository'
import { IdeasRepository } from './repositories/ideas.repository'
import { TasksRepository } from './repositories/tasks.repository'
import { PostsRepository } from './repositories/posts.repository'
import { MediaRepository } from './repositories/media.repository'
import { SettingsService } from './services/settings.service'
import { TasksService } from './services/tasks.service'
import { MEDIA_FILE_FILTERS, MediaService } from './services/media.service'
import { DashboardService } from './services/dashboard.service'
import { AiRepository } from './repositories/ai.repository'
import { AiService } from './ai/ai.service'
import { SafeStorageSecretStore } from './secrets/secrets.service'
import { handleMediaProtocol, registerMediaScheme } from './media/protocol'
import type { EventName, EventPayload } from '@shared/contracts/events'
import { registerAllIpc } from './ipc/register-all'
import { createLogger } from './log'

const log = createLogger('main')

// Ambas deben ir antes de whenReady.
configureUserDataPath()
registerMediaScheme()

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

/** Empuja un evento a todas las ventanas abiertas (streaming de Claude, avisos…). */
function broadcast<K extends EventName>(channel: K, payload: EventPayload<K>): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

/** Selector de archivos del sistema, anclado a la ventana principal. */
async function pickMediaFiles(): Promise<string[]> {
  const result = await dialog.showOpenDialog(mainWindow ?? new BrowserWindow({ show: false }), {
    title: 'Añadir imágenes o vídeos',
    properties: ['openFile', 'multiSelections'],
    filters: MEDIA_FILE_FILTERS
  })
  return result.canceled ? [] : result.filePaths
}

function bootstrap(): SettingsService {
  const { db, close } = openDatabase({ path: getDbPath(), migrationsFolder: getMigrationsDir() })
  closeDb = close

  const pillars = new PillarsRepository(db)
  const ideas = new IdeasRepository(db)
  const tasksRepo = new TasksRepository(db)
  const posts = new PostsRepository(db)
  const mediaRepo = new MediaRepository(db)

  const settings = new SettingsService(new SqliteSettingsRepository(db))
  const tasks = new TasksService(tasksRepo)
  const media = new MediaService(mediaRepo, getMediaDir(), pickMediaFiles)
  const dashboard = new DashboardService(tasksRepo, ideas, posts, pillars)
  const ai = new AiService({
    repo: new AiRepository(db),
    secrets: new SafeStorageSecretStore(db),
    settings,
    emit: (event) => broadcast('ai:stream', event),
    encryptionAvailable: () => safeStorage.isEncryptionAvailable()
  })

  registerAllIpc({ settings, pillars, ideas, tasks, posts, media, dashboard, ai })
  handleMediaProtocol(getMediaDir())
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
