import { createLogger } from './log'

const log = createLogger('scheduler')

export interface SchedulerDeps {
  /** Publica lo que toque ahora. */
  runDue: () => Promise<void>
  /** Refresca tokens que caducan pronto. */
  refreshTokens: () => Promise<void>
}

/**
 * Reloj de la app: cada minuto mira si hay publicaciones pendientes y, una vez al día,
 * refresca tokens. Solo funciona con la app abierta o en la bandeja (ver docs/PLAN.md §4.2).
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null
  private lastTokenCheck = 0
  private busy = false

  constructor(
    private readonly deps: SchedulerDeps,
    private readonly intervalMs = 60_000
  ) {}

  start(): void {
    if (this.timer) return
    void this.tick()
    this.timer = setInterval(() => void this.tick(), this.intervalMs)
    log.info(`Planificador activo (cada ${this.intervalMs / 1000} s)`)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async tick(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      await this.deps.runDue()
      if (Date.now() - this.lastTokenCheck > 24 * 60 * 60_000) {
        this.lastTokenCheck = Date.now()
        await this.deps.refreshTokens()
      }
    } catch (error) {
      log.error('Fallo en el planificador', error instanceof Error ? error.message : error)
    } finally {
      this.busy = false
    }
  }
}
