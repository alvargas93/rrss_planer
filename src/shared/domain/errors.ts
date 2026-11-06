/**
 * Error de aplicación con código tipado.
 * Los servicios lanzan AppError; la capa IPC lo serializa; la interfaz lo muestra.
 */
export type AppErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'EXTERNAL_API'
  | 'IO'
  | 'UNKNOWN'

export interface SerializedError {
  code: AppErrorCode
  message: string
  details?: unknown
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly details?: unknown

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }

  toJSON(): SerializedError {
    return { code: this.code, message: this.message, details: this.details }
  }

  static from(error: unknown): AppError {
    if (error instanceof AppError) return error
    if (error instanceof Error) return new AppError('UNKNOWN', error.message)
    return new AppError('UNKNOWN', 'Error desconocido', error)
  }
}

/** Resultado que viaja por IPC: nunca lanzamos excepciones a través del puente. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: SerializedError }
