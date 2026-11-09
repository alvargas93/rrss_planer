import { AppError } from '@shared/domain/errors'
import type { SettingsService } from './settings.service'
import type { BackupResult } from '../backup/backup'
import { createLogger } from '../log'

const log = createLogger('backup')
const DAY_MS = 86_400_000

export interface BackupStatus {
  dir: string
  everyDays: number
  lastBackupAt: string | null
  lastError: string | null
}

export class BackupService {
  private lastError: string | null = null

  constructor(
    private readonly deps: {
      settings: SettingsService
      backup: (dir: string, auto: boolean) => Promise<BackupResult>
    }
  ) {}

  status(): BackupStatus {
    const g = this.deps.settings.get().general
    return {
      dir: g.backupDir,
      everyDays: g.backupEveryDays,
      lastBackupAt: g.lastBackupAt,
      lastError: this.lastError
    }
  }

  /** Copia ahora en la carpeta elegida en Ajustes. */
  async runNow(auto = false, now = new Date()): Promise<BackupResult> {
    const dir = this.deps.settings.get().general.backupDir
    if (!dir) {
      throw new AppError('NOT_CONFIGURED', 'Elige primero la carpeta donde guardar las copias.')
    }
    try {
      const result = await this.deps.backup(dir, auto)
      this.lastError = null
      this.deps.settings.update({ general: { lastBackupAt: now.toISOString() } })
      log.info(`Copia ${result.snapshot} guardada (${result.mediaCopied} medios nuevos)`)
      return result
    } catch (error) {
      this.lastError = AppError.from(error).message
      throw error
    }
  }

  /** La llama el planificador: copia automática si toca y hay carpeta elegida. */
  async runIfDue(now = new Date()): Promise<boolean> {
    const g = this.deps.settings.get().general
    if (!g.backupDir || g.backupEveryDays <= 0) return false
    const last = g.lastBackupAt ? new Date(g.lastBackupAt).getTime() : 0
    if (now.getTime() - last < g.backupEveryDays * DAY_MS) return false
    try {
      await this.runNow(true, now)
      return true
    } catch (error) {
      log.warn(`Copia automática fallida: ${AppError.from(error).message}`)
      return false
    }
  }
}
