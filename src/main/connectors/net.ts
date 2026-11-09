import { AppError, type AppErrorCode } from '@shared/domain/errors'
import { createLogger } from '../log'

const log = createLogger('net')

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** Extrae un mensaje legible del cuerpo de error de una API (JSON o texto). */
export function messageFromBody(text: string): string {
  try {
    const json = JSON.parse(text) as Record<string, unknown>
    const err = json['error']
    if (typeof err === 'string') {
      const description = json['error_description']
      return typeof description === 'string' ? description : err
    }
    if (err && typeof err === 'object') {
      const message = (err as { message?: unknown }).message
      if (typeof message === 'string') return message
    }
    for (const key of ['detail', 'message', 'title']) {
      const value = json[key]
      if (typeof value === 'string') return value
    }
  } catch {
    // no era JSON: se devuelve el texto
  }
  return text.slice(0, 200)
}

/** Traduce una respuesta HTTP de error a un AppError con un mensaje claro en español. */
export function errorFromStatus(label: string, status: number, text: string): AppError {
  const detail = messageFromBody(text)
  const lower = text.toLowerCase()
  let code: AppErrorCode = 'EXTERNAL_API'
  let message = `${label} respondió con un error (${status}): ${detail}`
  if (status === 401 || lower.includes('invalid_grant')) {
    code = 'UNAUTHORIZED'
    message = `El acceso a ${label} ha caducado o fue revocado. Vuelve a conectar la cuenta.`
  } else if (
    status === 429 ||
    lower.includes('quotaexceeded') ||
    lower.includes('ratelimitexceeded')
  ) {
    code = 'RATE_LIMITED'
    message = `${label} ha limitado las peticiones o se agotó el cupo diario. Reinténtalo más tarde.`
  } else if (status === 402 || lower.includes('credits')) {
    message = `${label} indica que no hay saldo o créditos en la cuenta de desarrollador: ${detail}`
  } else if (status === 403) {
    code = 'UNAUTHORIZED'
    message = `${label} no permite esta acción con los permisos actuales: ${detail}`
  } else if (status === 400 || status === 413 || status === 422) {
    code = 'VALIDATION'
    message = `${label} rechazó la petición: ${detail}`
  }
  return new AppError(code, message, { status, body: text.slice(0, 500) })
}

export type SendInit = RequestInit & { timeoutMs?: number }

/** `fetch` con tiempo máximo y errores de red traducidos. No comprueba el estado HTTP. */
export async function send(label: string, url: string, init: SendInit = {}): Promise<Response> {
  const { timeoutMs = 120_000, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...rest, signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError('EXTERNAL_API', `${label} tardó demasiado en responder.`)
    }
    throw new AppError('EXTERNAL_API', `No se pudo conectar con ${label}. Comprueba tu red.`, {
      cause: error instanceof Error ? error.message : String(error)
    })
  } finally {
    clearTimeout(timer)
  }
}

/** Como `send`, pero lanza un AppError si la respuesta no es 2xx. */
export async function sendOk(label: string, url: string, init: SendInit = {}): Promise<Response> {
  const response = await send(label, url, init)
  if (!response.ok) {
    const text = await response.text()
    log.warn(
      `HTTP ${response.status} en ${new URL(url).host}${new URL(url).pathname}`,
      text.slice(0, 300)
    )
    throw errorFromStatus(label, response.status, text)
  }
  return response
}

/** Petición con respuesta JSON (o null si el cuerpo viene vacío). */
export async function sendJson<T>(label: string, url: string, init: SendInit = {}): Promise<T> {
  const response = await sendOk(label, url, init)
  const text = await response.text()
  return (text ? JSON.parse(text) : null) as T
}

/** Cuerpo `application/x-www-form-urlencoded` ignorando los valores vacíos. */
export function formBody(values: Record<string, string | undefined>): URLSearchParams {
  const form = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') form.set(key, value)
  }
  return form
}
