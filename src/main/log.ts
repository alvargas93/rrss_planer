/**
 * Registro mínimo con niveles. Regla: nunca registrar tokens, claves ni cuerpos
 * de peticiones con secretos. En Fase 8 se puede sustituir por un logger a fichero
 * manteniendo esta misma interfaz.
 */
type Level = 'debug' | 'info' | 'warn' | 'error'

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const minLevel: Level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'

function emit(level: Level, scope: string, message: string, meta?: unknown): void {
  if (order[level] < order[minLevel]) return
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] [${scope}] ${message}`
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  if (meta === undefined) fn(line)
  else fn(line, meta)
}

type LogFn = (message: string, meta?: unknown) => void

export interface Logger {
  debug: LogFn
  info: LogFn
  warn: LogFn
  error: LogFn
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, meta) => emit('debug', scope, message, meta),
    info: (message, meta) => emit('info', scope, message, meta),
    warn: (message, meta) => emit('warn', scope, message, meta),
    error: (message, meta) => emit('error', scope, message, meta)
  }
}
