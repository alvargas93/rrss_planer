import { app, shell } from 'electron'
import { handle } from './registry'
import { AppError } from '@shared/domain/errors'
import type { AppInfo } from '@shared/domain/app-info'
import type { SettingsService } from '../services/settings.service'
import { APP_DISPLAY_NAME, getDataDir, getDbPath } from '../paths'

export interface IpcDependencies {
  settings: SettingsService
}

/** Conecta cada canal de los contratos con el servicio que lo atiende. */
export function registerAllIpc(deps: IpcDependencies): void {
  // --- app ---
  handle('app:getInfo', (): AppInfo => ({
    name: APP_DISPLAY_NAME,
    version: app.getVersion(),
    platform: process.platform as AppInfo['platform'],
    isDev: !app.isPackaged,
    dataDir: getDataDir(),
    dbPath: getDbPath(),
    electron: process.versions.electron ?? 'desconocida',
    node: process.versions.node
  }))

  handle('app:openDataFolder', async () => {
    const result = await shell.openPath(getDataDir())
    if (result) throw new AppError('IO', `No se pudo abrir la carpeta: ${result}`)
  })

  handle('app:openExternal', async ({ url }) => {
    if (!url.startsWith('https://')) {
      throw new AppError('VALIDATION', 'Solo se abren enlaces https')
    }
    await shell.openExternal(url)
  })

  // --- settings ---
  handle('settings:get', () => deps.settings.get())
  handle('settings:update', (patch) => deps.settings.update(patch))
  handle('settings:reset', () => deps.settings.reset())
}
