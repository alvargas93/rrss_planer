import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { shell } from 'electron'
import { AppError } from '@shared/domain/errors'
import { IG_OAUTH_AUTHORIZE, IG_SCOPES, InstagramApi } from './instagram.api'
import { createLogger } from '../../log'

const log = createLogger('ig-oauth')

export const OAUTH_PORT = 47821
export const OAUTH_REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback`
const TIMEOUT_MS = 5 * 60_000

const page = (title: string, body: string): string =>
  `<!doctype html><html lang="es"><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;max-width:520px;margin:80px auto;text-align:center"><h1>${title}</h1><p>${body}</p></body></html>`

/**
 * Business Login for Instagram con servidor local (loopback).
 * Abre el navegador del sistema, espera el `code` en http://localhost:47821/callback,
 * lo canjea por un token corto y después por uno largo (60 días).
 *
 * [no confirmado] Meta podría no aceptar http://localhost como redirect URI;
 * en ese caso se usa el token generado en el App Dashboard.
 */
export async function runInstagramOAuth(input: {
  appId: string
  appSecret: string
}): Promise<{ accessToken: string; expiresAt: string; userId: string; permissions: string[] }> {
  const state = randomBytes(16).toString('hex')
  const authorizeUrl = new URL(IG_OAUTH_AUTHORIZE)
  authorizeUrl.searchParams.set('client_id', input.appId)
  authorizeUrl.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('scope', IG_SCOPES.join(','))
  authorizeUrl.searchParams.set('state', state)

  const code = await new Promise<string>((resolve, reject) => {
    let server: Server | null = null
    const finish = (fn: () => void): void => {
      clearTimeout(timer)
      server?.close()
      fn()
    }
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(
            new AppError(
              'EXTERNAL_API',
              'Se agotó el tiempo esperando la autorización de Instagram.'
            )
          )
        ),
      TIMEOUT_MS
    )
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', OAUTH_REDIRECT_URI)
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const error = url.searchParams.get('error_description') ?? url.searchParams.get('error')
      const returnedState = url.searchParams.get('state')
      const returnedCode = url.searchParams.get('code')?.replace(/#_$/, '')
      if (error || !returnedCode || returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(
          page(
            'No se pudo conectar',
            error ?? 'Respuesta inválida. Vuelve a la app e inténtalo de nuevo.'
          )
        )
        finish(() =>
          reject(
            new AppError('UNAUTHORIZED', error ?? 'Instagram devolvió una respuesta inválida.')
          )
        )
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(page('Cuenta conectada', 'Ya puedes cerrar esta pestaña y volver a RRSS Planner.'))
      finish(() => resolve(returnedCode))
    })
    server.on('error', (err) =>
      finish(() =>
        reject(
          new AppError(
            'IO',
            `No se pudo abrir el puerto ${OAUTH_PORT} para recibir la respuesta: ${err.message}`
          )
        )
      )
    )
    server.listen(OAUTH_PORT, '127.0.0.1', () => {
      log.info('Esperando autorización de Instagram en el navegador')
      void shell.openExternal(authorizeUrl.toString())
    })
  })

  const short = await InstagramApi.exchangeCode({
    appId: input.appId,
    appSecret: input.appSecret,
    redirectUri: OAUTH_REDIRECT_URI,
    code
  })
  const long = await InstagramApi.exchangeForLongLived(short.access_token, input.appSecret)
  return {
    accessToken: long.access_token,
    expiresAt: new Date(Date.now() + long.expires_in * 1000).toISOString(),
    userId: short.user_id,
    permissions: short.permissions ?? []
  }
}
