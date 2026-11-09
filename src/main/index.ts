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
import { VideoRepository } from './repositories/video.repository'
import { VideoService } from './services/video.service'
import { transcribePcm } from './video/transcribe'
import { getDataDir } from './paths'
import { tmpdir } from 'node:os'
import { AiRepository } from './repositories/ai.repository'
import { AiService } from './ai/ai.service'
import { SafeStorageSecretStore } from './secrets/secrets.service'
import { ConnectorRegistry } from './connectors/registry'
import { runInstagramOAuth } from './connectors/instagram/oauth'
import { InstagramConnector } from './connectors/instagram/instagram.connector'
import { YoutubeConnector } from './connectors/youtube/youtube.connector'
import { runYoutubeOAuth } from './connectors/youtube/oauth'
import { LinkedInConnector } from './connectors/linkedin/linkedin.connector'
import { runLinkedInOAuth } from './connectors/linkedin/oauth'
import { XConnector } from './connectors/x/x.connector'
import { runXOAuth } from './connectors/x/oauth'
import { CLIENT_ID_SETTING, clientSecretKey } from './connectors/clients'
import type { OAuthClient } from './connectors/oauth-pkce'
import type { OAuthNetwork } from '@shared/domain/accounts'
import { CloudinaryMediaHost } from './media-host/cloudinary'
import { NoMediaHost, type MediaHost } from './media-host/media-host'
import { createNotifier } from './notifications'
import { Scheduler } from './scheduler'
import { ensureTray } from './tray'
import { handleMediaProtocol, registerMediaScheme } from './media/protocol'
import type { EventName, EventPayload } from '@shared/contracts/events'
import { PUBLISHING_SECRET_KEYS, registerAllIpc } from './ipc/register-all'
import { createLogger } from './log'
import { readFileSync } from 'node:fs'
import { autoUpdater } from 'electron-updater'
import { BackupService } from './services/backup.service'
import { UpdateService, type UpdaterLike } from './services/update.service'
import { applyPendingRestore, createBackup, listSnapshots, stageRestore } from './backup/backup'
import { dumpWithoutSecrets, mergeSecrets } from './backup/sqlite'
import { applyLoginItem, startedHidden } from './system/login-item'

const log = createLogger('main')

// Ambas deben ir antes de whenReady.
configureUserDataPath()
registerMediaScheme()

// Una sola copia de la app: si ya está abierta (o en la bandeja), la segunda solo la muestra.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) app.quit()
else app.on('second-instance', () => showMainWindow())

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

  mainWindow.on('ready-to-show', () => {
    // Arranque con el sistema: sin ventana, solo la bandeja (si no hay bandeja, se muestra).
    if (startedHidden() && settings.get().general.keepRunningInTray) {
      ensureTray(icon, { show: showMainWindow, quit: () => app.quit() })
      return
    }
    mainWindow?.show()
  })
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

/** Número de migraciones de esta versión: sirve para saber si una copia se puede restaurar. */
function readSchemaVersion(): number {
  try {
    const journal = JSON.parse(
      readFileSync(join(getMigrationsDir(), 'meta', '_journal.json'), 'utf8')
    ) as { entries: unknown[] }
    return journal.entries.length
  } catch (error) {
    log.warn(
      'No se pudo leer el diario de migraciones',
      error instanceof Error ? error.message : error
    )
    return 0
  }
}

function bootstrap(): SettingsService {
  const { db, sqlite, close } = openDatabase({
    path: getDbPath(),
    migrationsFolder: getMigrationsDir()
  })
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

  const openUrl = (url: string): void => void shell.openExternal(url)
  const clientFor = (network: OAuthNetwork) => (): OAuthClient => ({
    clientId: settings.get().publishing[CLIENT_ID_SETTING[network]],
    clientSecret: secrets.get(clientSecretKey(network)) ?? ''
  })
  const connectors = new ConnectorRegistry([
    new InstagramConnector(),
    new YoutubeConnector(clientFor('youtube')),
    new LinkedInConnector(),
    new XConnector(clientFor('x'))
  ])
  const accounts = new AccountsService(accountsRepo, secrets, connectors, runInstagramOAuth, {
    youtube: (client) => runYoutubeOAuth(client, openUrl),
    linkedin: (client) => runLinkedInOAuth(client, openUrl),
    x: (client) => runXOAuth(client, openUrl)
  })
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
    copyToClipboard: (text) => clipboard.writeText(text),
    prepareImage: (asset) => media.ensureJpeg(asset)
  })

  const video = new VideoService({
    repo: new VideoRepository(db),
    media,
    mediaDir: getMediaDir(),
    tempDir: join(tmpdir(), 'rrss-planner'),
    emit: (progress) => broadcast('video:progress', progress),
    transcribe: (pcm, offsetSec) =>
      transcribePcm(pcm, offsetSec, { modelDir: join(getDataDir(), 'models') })
  })
  // Vídeos importados antes de la Fase 6: completar duración y miniatura en segundo plano.
  setTimeout(() => void media.processPending(), 8000)
  const analytics = new AnalyticsService(new AnalyticsRepository(db), accounts, connectors, targets)

  const schemaVersion = readSchemaVersion()
  const backupDeps = {
    dataDir: getDataDir(),
    mediaDir: getMediaDir(),
    appVersion: app.getVersion(),
    schemaVersion,
    dumpDatabase: (dest: string) => dumpWithoutSecrets(sqlite, dest)
  }
  const backup = new BackupService({
    settings,
    backup: (dir, auto) => createBackup(backupDeps, dir, { auto })
  })
  const updates = new UpdateService({
    updater: autoUpdater as unknown as UpdaterLike,
    settings,
    emit: (state) => broadcast('updates:state', state),
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged
  })

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
    analytics,
    video,
    backup,
    listBackups: (dir) => listSnapshots(dir, schemaVersion),
    restoreBackup: async (dir, snapshot) => {
      await stageRestore(
        { dataDir: getDataDir(), mediaDir: getMediaDir(), schemaVersion },
        dir,
        snapshot
      )
      // Se responde primero a la interfaz y luego se reinicia: al arrancar se aplica la copia.
      setTimeout(() => {
        quitting = true
        scheduler?.stop()
        closeDb?.()
        app.relaunch()
        app.exit(0)
      }, 800)
    },
    updates
  })
  handleMediaProtocol(getMediaDir())

  scheduler = new Scheduler({
    runDue: () => publishing.runDue(),
    refreshTokens: () => accounts.refreshExpiring(),
    syncAnalytics: () => analytics.syncAll().then(() => undefined),
    backupIfDue: () => backup.runIfDue(),
    checkUpdates: () => updates.autoCheck()
  })
  return settings
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return
  electronApp.setAppUserModelId('com.vargas.rrssplanner')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Si se pidió restaurar una copia, se aplica ahora, antes de abrir la base de datos.
  try {
    const safety = await applyPendingRestore(getDataDir(), mergeSecrets)
    if (safety) log.info(`Copia restaurada. La base anterior está en ${safety}`)
  } catch (error) {
    log.error('No se pudo aplicar la restauración', error instanceof Error ? error.message : error)
  }

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

  applyLoginItem(settings.get())
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
