import type { SettingsService } from './settings.service'
import { createLogger } from '../log'

const log = createLogger('updates')

export type UpdateStatus =
  | 'dev'
  | 'not-configured'
  | 'idle'
  | 'checking'
  | 'none'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  version: string | null
  percent: number | null
  message: string | null
}

/** Lo que usamos de `electron-updater`; permite probar el servicio con un doble. */
export interface UpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  setFeedURL(options: { provider: 'generic'; url: string }): void
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
  on(event: string, listener: (payload: never) => void): unknown
}

export interface UpdateDeps {
  updater: UpdaterLike
  settings: SettingsService
  emit: (state: UpdateState) => void
  currentVersion: string
  isPackaged: boolean
}

/**
 * Actualizaciones automáticas desde una dirección que el usuario elige en Ajustes (por
 * ejemplo GitHub Releases). Nunca descarga ni instala sin que el usuario pulse el botón.
 */
export class UpdateService {
  private state: UpdateState
  private feed = ''

  constructor(private readonly deps: UpdateDeps) {
    this.state = this.make(deps.isPackaged ? 'idle' : 'dev')
    const { updater } = deps
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.on('checking-for-update', (() => this.set('checking')) as () => void)
    updater.on('update-available', ((info: { version: string }) =>
      this.set('available', { version: info.version })) as (payload: never) => void)
    updater.on('update-not-available', (() => this.set('none')) as () => void)
    updater.on('download-progress', ((p: { percent: number }) =>
      this.set('downloading', { percent: Math.round(p.percent) })) as (payload: never) => void)
    updater.on('update-downloaded', ((info: { version: string }) =>
      this.set('ready', { version: info.version })) as (payload: never) => void)
    updater.on('error', ((error: Error) => {
      log.warn(`Actualizaciones: ${error.message}`)
      this.set('error', {
        message: 'No se pudo comprobar la actualización. Revisa la dirección y tu conexión.'
      })
    }) as (payload: never) => void)
  }

  get(): UpdateState {
    return this.state
  }

  /** Busca una versión nueva. */
  async check(): Promise<UpdateState> {
    if (!this.deps.isPackaged) {
      return this.set('dev', { message: 'Solo funciona en la app instalada, no en desarrollo.' })
    }
    const url = this.deps.settings.get().general.updateFeedUrl.trim()
    if (!url) {
      return this.set('not-configured', {
        message: 'Indica en Ajustes la dirección donde publicas las versiones.'
      })
    }
    if (url !== this.feed) {
      this.deps.updater.setFeedURL({ provider: 'generic', url })
      this.feed = url
    }
    try {
      await this.deps.updater.checkForUpdates()
    } catch (error) {
      log.warn(`Comprobación fallida: ${error instanceof Error ? error.message : String(error)}`)
      this.set('error', {
        message: 'No se pudo comprobar la actualización. Revisa la dirección y tu conexión.'
      })
    }
    return this.state
  }

  /** Descarga la versión encontrada (solo si el usuario lo pide). */
  async download(): Promise<UpdateState> {
    if (this.state.status !== 'available') return this.state
    this.set('downloading', { percent: 0 })
    try {
      await this.deps.updater.downloadUpdate()
    } catch {
      this.set('error', { message: 'La descarga falló. Inténtalo de nuevo.' })
    }
    return this.state
  }

  /** Cierra la app e instala la versión ya descargada. */
  install(): void {
    if (this.state.status === 'ready') this.deps.updater.quitAndInstall()
  }

  /** Comprobación diaria desde el planificador, si el usuario la dejó activa. */
  async autoCheck(): Promise<void> {
    if (!this.deps.settings.get().general.autoCheckUpdates) return
    if (!this.deps.isPackaged || !this.deps.settings.get().general.updateFeedUrl.trim()) return
    await this.check()
  }

  private make(status: UpdateStatus, extra: Partial<UpdateState> = {}): UpdateState {
    return {
      status,
      currentVersion: this.deps.currentVersion,
      version: null,
      percent: null,
      message: null,
      ...extra
    }
  }

  private set(status: UpdateStatus, extra: Partial<UpdateState> = {}): UpdateState {
    this.state = this.make(status, {
      version: this.state.version,
      ...(status === 'checking' || status === 'none' || status === 'error'
        ? { version: null }
        : {}),
      ...extra
    })
    this.deps.emit(this.state)
    return this.state
  }
}
