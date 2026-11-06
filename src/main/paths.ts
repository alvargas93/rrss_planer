import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

export const APP_DISPLAY_NAME = 'Cadencia'

/**
 * Carpeta de datos del usuario. En desarrollo usamos una carpeta distinta
 * ("Cadencia-dev") para no mezclar datos con una instalación real.
 * Debe llamarse ANTES de `app.whenReady()`.
 */
export function configureUserDataPath(): void {
  const folderName = app.isPackaged ? APP_DISPLAY_NAME : `${APP_DISPLAY_NAME}-dev`
  app.setPath('userData', join(app.getPath('appData'), folderName))
}

export function getDataDir(): string {
  const dir = join(app.getPath('userData'), 'data')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function getMediaDir(): string {
  const dir = join(getDataDir(), 'media')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function getDbPath(): string {
  return join(getDataDir(), 'cadencia.db')
}

/** Carpeta con las migraciones SQL (dentro del paquete en producción). */
export function getMigrationsDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'drizzle') : join(app.getAppPath(), 'drizzle')
}
