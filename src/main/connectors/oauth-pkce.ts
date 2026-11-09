import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { AppError } from '@shared/domain/errors'
import { createLogger } from '../log'

const log = createLogger('oauth')

/** Datos públicos de la app que el usuario crea en cada red. El secreto puede faltar. */
export interface OAuthClient {
  clientId: string
  clientSecret: string
}

/** Resultado de una autorización completada. */
export interface OAuthResult {
  accessToken: string
  refreshToken: string | null
  /** Caducidad del access token (puede ser de horas). */
  expiresAt: string | null
  scopes: string[]
}

export type OAuthRunner = (client: OAuthClient) => Promise<OAuthResult>

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url') // 64 caracteres
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export interface LoopbackOptions {
  label: string
  authorizeUrl: string
  /** Parámetros propios de la red (client_id, scope…). state, redirect_uri y PKCE los añade esta función. */
  params: Record<string, string>
  /** Cómo se escribe la dirección de retorno: `127.0.0.1` o `localhost`. */
  redirectHost: '127.0.0.1' | 'localhost'
  /** 0 = puerto libre elegido por el sistema. */
  port: number
  pkce: boolean
  openUrl: (url: string) => void
  timeoutMs?: number
}

export interface LoopbackResult {
  code: string
  redirectUri: string
  codeVerifier: string | null
}

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const page = (title: string, body: string): string =>
  `<!doctype html><html lang="es"><meta charset="utf-8"><title>${escapeHtml(title)}</title><body style="font-family:system-ui;max-width:520px;margin:80px auto;text-align:center"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body></html>`

/**
 * Autorización OAuth 2.0 de escritorio: abre el navegador del sistema y espera el `code`
 * en un servidor que solo escucha en el propio equipo (127.0.0.1). Nunca se pide ni se ve
 * la contraseña de la red: el usuario la escribe en la web oficial.
 */
export function runLoopback(options: LoopbackOptions): Promise<LoopbackResult> {
  const state = randomBytes(16).toString('hex')
  const pkce = options.pkce ? pkcePair() : null
  return new Promise<LoopbackResult>((resolve, reject) => {
    let server: Server | null = null
    let redirectUri = ''
    const finish = (fn: () => void): void => {
      clearTimeout(timer)
      server?.close()
      server?.closeAllConnections?.()
      fn()
    }
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(
            new AppError(
              'EXTERNAL_API',
              `Se agotó el tiempo esperando la autorización de ${options.label}.`
            )
          )
        ),
      options.timeoutMs ?? 5 * 60_000
    )
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const error = url.searchParams.get('error_description') ?? url.searchParams.get('error')
      const code = url.searchParams.get('code')
      if (error || !code || url.searchParams.get('state') !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(
          page(
            'No se pudo conectar',
            error ?? 'Respuesta inválida. Vuelve a la app e inténtalo de nuevo.'
          )
        )
        finish(() =>
          reject(
            new AppError(
              'UNAUTHORIZED',
              error ?? `${options.label} devolvió una respuesta inválida.`
            )
          )
        )
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(page('Cuenta conectada', 'Ya puedes cerrar esta pestaña y volver a RRSS Planner.'))
      finish(() => resolve({ code, redirectUri, codeVerifier: pkce?.verifier ?? null }))
    })
    server.on('error', (err) =>
      finish(() =>
        reject(
          new AppError(
            'IO',
            `No se pudo abrir el puerto local para recibir la respuesta de ${options.label}: ${err.message}`
          )
        )
      )
    )
    server.listen(options.port, '127.0.0.1', () => {
      const port = (server!.address() as AddressInfo).port
      redirectUri = `http://${options.redirectHost}:${port}/callback`
      const authorize = new URL(options.authorizeUrl)
      for (const [key, value] of Object.entries(options.params))
        authorize.searchParams.set(key, value)
      authorize.searchParams.set('redirect_uri', redirectUri)
      authorize.searchParams.set('state', state)
      if (pkce) {
        authorize.searchParams.set('code_challenge', pkce.challenge)
        authorize.searchParams.set('code_challenge_method', 'S256')
      }
      log.info(`Esperando autorización de ${options.label} en el navegador`)
      options.openUrl(authorize.toString())
    })
  })
}

/** Caducidad ISO a partir de `expires_in` (segundos) o null. */
export function expiryFrom(seconds: number | undefined, now = Date.now()): string | null {
  return typeof seconds === 'number' && seconds > 0
    ? new Date(now + seconds * 1000).toISOString()
    : null
}
