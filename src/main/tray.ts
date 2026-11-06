import { Menu, Tray, app, nativeImage } from 'electron'
import { APP_DISPLAY_NAME } from './paths'

let tray: Tray | null = null

/**
 * Icono en la bandeja del sistema para que la app siga publicando con la ventana cerrada.
 */
export function ensureTray(
  iconPath: string,
  actions: { show: () => void; quit: () => void }
): Tray {
  if (tray) return tray
  const image = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(image)
  tray.setToolTip(`${APP_DISPLAY_NAME} · sigue publicando en segundo plano`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Abrir ${APP_DISPLAY_NAME}`, click: actions.show },
      { type: 'separator' },
      { label: 'Salir del todo', click: actions.quit }
    ])
  )
  tray.on('click', actions.show)
  tray.on('double-click', actions.show)
  app.on('before-quit', () => {
    tray?.destroy()
    tray = null
  })
  return tray
}
