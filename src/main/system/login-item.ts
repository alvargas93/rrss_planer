import { app } from 'electron'
import type { Settings } from '@shared/domain/settings'

/** Argumento con el que el sistema abre la app al iniciar sesión: arranca sin ventana. */
export const HIDDEN_FLAG = '--hidden'

/**
 * Registra o quita el arranque con el sistema. Solo en la app instalada: en desarrollo
 * registraría el ejecutable de Electron suelto, que no es la app.
 */
export function applyLoginItem(settings: Settings): void {
  if (!app.isPackaged) return
  const enabled = settings.general.launchAtLogin
  app.setLoginItemSettings({ openAtLogin: enabled, args: enabled ? [HIDDEN_FLAG] : [] })
}

export const startedHidden = (): boolean => process.argv.includes(HIDDEN_FLAG)
