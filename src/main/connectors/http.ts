import { AppError, type AppErrorCode } from '@shared/domain/errors'
import { createLogger } from '../log'

const log = createLogger('http')

export interface GraphError {
  message: string
  type?: string
  code?: number
  error_subcode?: number
  error_user_msg?: string
  fbtrace_id?: string
}

/** Traduce un error de la Graph API de Meta a un error de la app. */
export function translateGraphError(error: GraphError, status: number): AppError {
  const code = error.code ?? 0
  const detail = error.error_user_msg ?? error.message
  let appCode: AppErrorCode = 'EXTERNAL_API'
  let message = `Instagram respondió con un error: ${detail}`
  if (code === 190 || status === 401) {
    appCode = 'UNAUTHORIZED'
    message = 'El acceso a Instagram ha caducado o fue revocado. Vuelve a conectar la cuenta.'
  } else if (code === 4 || code === 17 || code === 32 || code === 613 || status === 429) {
    appCode = 'RATE_LIMITED'
    message = 'Instagram ha limitado las peticiones por ahora. Se reintentará más tarde.'
  } else if (code === 9) {
    appCode = 'RATE_LIMITED'
    message = 'Has alcanzado el cupo de publicaciones por API de Instagram (24 h).'
  } else if (code === 10 || code === 200 || code === 203 || status === 403) {
    appCode = 'UNAUTHORIZED'
    message = `Instagram no permite esta acción con los permisos actuales: ${detail}`
  } else if (code >= 36000 && code < 37000) {
    appCode = 'VALIDATION'
    message = `Instagram rechazó el medio: ${detail}`
  }
  return new AppError(appCode, message, { graph: error, status })
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  /** Parámetros de consulta (GET) o de formulario (POST). */
  params?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
  body?: BodyInit
  timeoutMs?: number
}

/** Petición JSON con tiempo máximo y errores traducidos. */
export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const target = new URL(url)
  let body: BodyInit | undefined = options.body
  if (options.params) {
    const entries = Object.entries(options.params).filter(
      (e): e is [string, string | number | boolean] => e[1] !== undefined
    )
    if (method === 'GET' || body !== undefined) {
      for (const [k, v] of entries) target.searchParams.set(k, String(v))
    } else {
      const form = new URLSearchParams()
      for (const [k, v] of entries) form.set(k, String(v))
      body = form
    }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000)
  try {
    const response = await fetch(target, {
      method,
      body,
      headers: options.headers,
      signal: controller.signal
    })
    const text = await response.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    if (!response.ok) {
      const graph = (json as { error?: GraphError } | null)?.error
      if (graph) throw translateGraphError(graph, response.status)
      log.warn(`HTTP ${response.status} en ${target.host}${target.pathname}`, text.slice(0, 300))
      throw new AppError('EXTERNAL_API', `Error ${response.status} al hablar con ${target.host}`, {
        body: text.slice(0, 500)
      })
    }
    return json as T
  } catch (error) {
    if (error instanceof AppError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError('EXTERNAL_API', `${target.host} tardó demasiado en responder.`)
    }
    throw new AppError(
      'EXTERNAL_API',
      `No se pudo conectar con ${target.host}. Comprueba tu red.`,
      {
        cause: error instanceof Error ? error.message : String(error)
      }
    )
  } finally {
    clearTimeout(timer)
  }
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))
