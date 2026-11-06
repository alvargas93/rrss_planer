import { Notification } from 'electron'
import { createLogger } from './log'

const log = createLogger('notify')

export interface Notice {
  title: string
  body: string
  /** Ruta de la app a la que ir al pulsar el aviso (p. ej. /compose/<id>). */
  navigateTo?: string
}

export type Notifier = (notice: Notice) => void

/** Avisos del sistema. `onNavigate` muestra la ventana y navega a la ruta. */
export function createNotifier(onNavigate: (to: string) => void): Notifier {
  return (notice) => {
    if (!Notification.isSupported()) {
      log.info(`Aviso (sin soporte de notificaciones): ${notice.title} — ${notice.body}`)
      return
    }
    const n = new Notification({ title: notice.title, body: notice.body, silent: false })
    if (notice.navigateTo) {
      const to = notice.navigateTo
      n.on('click', () => onNavigate(to))
    }
    n.show()
  }
}
