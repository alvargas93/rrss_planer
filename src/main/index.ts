import { app, shell, BrowserWindow, clipboard, dialog, nativeTheme, safeStorage } from 'electron'
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
import { AccountsRepository } from './repositories/accounts.repository'
import { TargetsRepository } from './repositories/targets.repository'
import { SettingsService } from './services/settings.service'
import { TasksService } from './services/tasks.service'
import { MEDIA_FILE_FILTERS, MediaService } from './services/media.service'
import { DashboardService } from './services/dashboard.service'
import { AccountsService } from './services/accounts.service'
import { PublishingService } from './services/publishing.service'
import { AnalyticsService } from './services/analytics.service'
import { AnalyticsRepository } from './repositories/analytics.repository'
import { AiRepository } from './repositories/ai.repository'
import { AiService } from './ai/ai.service'
import { SafeStorageSecretStore } from './secrets/secrets.service'
import { ConnectorRegistry } from './connectors/registry'
import { runInstagramOAuth } from './connectors/instagram/oauth'
import { CloudinaryMediaHost } from './media-host/cloudinary'
import { NoMediaHost, type MediaHost } from './media-host/media-host'
import { createNotifier } from './notifications'
import { Scheduler } from './scheduler'
import { ensureTray } from './tray'
import { handleMediaProtocol, registerMediaScheme } from './media/protocol'
import type { EventName, EventPayload } from '@shared/contracts/events'
import { PUBLISHING_SECRET_KEYS, registerAllIpc } from './ipc/register-all'
import { createLogger } from './log'

const log = createLogger('main')

// Ambas deben ir antes de whenReady.
configureUserDataPath()
registerMediaScheme()

let mainWindow: BrowserWindow | null = null
let closeDb: (() => void) | null = null
let scheduler: Scheduler | null = null
let quitting = false
/** Se rellena en bootstrap; lo usa el cierre de ventana para decidir si ir a la bandeja. */
let settingsRef: SettingsService | null = null

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (settingsRef) createWindow(settingsRef)
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

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

  // Con "seguir en la bandeja", cerrar la ventana la oculta y la app sigue publicando.
  mainWindow.on('close', (event) => {
    if (quitting || !settings.get().general.keepRunningInTray) return
    event.preventDefault()
    mainWindow?.hide()
    ensureTray(icon, { show: showMainWindow, quit: () => app.quit() })
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
  const accountsRepo = new AccountsRepository(db)
  const targets = new TargetsRepository(db)
  const secrets = new SafeStorageSecretStore(db)

  const settings = new SettingsService(new SqliteSettingsRepository(db))
  settingsRef = settings
  const tasks = new TasksService(tasksRepo)
  const media = new MediaService(mediaRepo, getMediaDir(), pickMediaFiles)
  const dashboard = new DashboardService(tasksRepo, ideas, posts, pillars)
  const ai = new AiService({
    repo: new AiRepository(db),
    secrets,
    settings,
    emit: (event) => broadcast('ai:stream', event),
    encryptionAvailable: () => safeStorage.isEncryptionAvailable()
  })

  const connectors = new ConnectorRegistry()
  const accounts = new AccountsService(accountsRepo, secrets, connectors, runInstagramOAuth)
  const noHost = new NoMediaHost()
  const cloudinary = new CloudinaryMediaHost(() => {
    const p = settings.get().publishing
    return {
      cloudName: p.cloudinaryCloudName,
      apiKey: p.cloudinaryApiKey,
      apiSecret: secrets.get(PUBLISHING_SECRET_KEYS.cloudinaryApiSecret) ?? ''
    }
  })
  const mediaHost = (): MediaHost =>
    settings.get().publishing.mediaHost === 'cloudinary' ? cloudinary : noHost
  const notify = createNotifier((to) => {
    showMainWindow()
    broadcast('app:navigate', { to })
  })
  const publishing = new PublishingService({
    posts,
    targets,
    accounts,
    connectors,
    mediaHost,
    settings,
    notify,
    mediaDir: getMediaDir(),
    onPostChanged: (postId) => broadcast('publishing:update', { postId }),
    copyToClipboard: (text) => clipboard.writeText(text)
  })

  const analytics = new AnalyticsService(new AnalyticsRepository(db), accounts, connectors, targets)

  registerAllIpc({
    settings,
    pillars,
    ideas,
    tasks,
    posts,
    media,
    dashboard,
    ai,
    accounts,
    publishing,
    secrets,
    mediaHost,
    analytics
  })
  handleMediaProtocol(getMediaDir())

  scheduler = new Scheduler({
    runDue: () => publishing.runDue(),
    refreshTokens: () => accounts.refreshExpiring(),
    syncAnalytics: () => analytics.syncAll().then(() => undefined)
  })
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
  // El planificador arranca unos segundos después para no competir con la carga de la ventana.
  setTimeout(() => scheduler?.start(), 5000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(settings)
    else showMainWindow()
  })
})

app.on('before-quit', () => {
  quitting = true
  scheduler?.stop()
})

app.on('window-all-closed', () => {
  // Con la bandeja activa la ventana se oculta en vez de cerrarse, así que aquí solo
  // llegamos si el usuario desactivó "seguir en la bandeja" (o en macOS).
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  closeDb?.()
})
