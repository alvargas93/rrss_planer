import { expiryFrom, runLoopback, type OAuthClient, type OAuthResult } from '../oauth-pkce'
import { formBody, sendJson } from '../net'

export const X_AUTHORIZE = 'https://x.com/i/oauth2/authorize'
export const X_TOKEN = 'https://api.x.com/2/oauth2/token'
export const X_OAUTH_PORT = 47823

/** Scopes verificados en docs/connectors/x.md. */
export const X_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write']

interface TokenResponse {
  access_token: string
  expires_in?: number
  refresh_token?: string
  scope?: string
}

/** Cabecera de autenticación del cliente: con secreto (confidencial) o sin él (nativo). */
export function clientAuthHeaders(client: OAuthClient): Record<string, string> {
  if (!client.clientSecret) return {}
  const basic = Buffer.from(`${client.clientId}:${client.clientSecret}`).toString('base64')
  return { Authorization: `Basic ${basic}` }
}

function toResult(token: TokenResponse): OAuthResult {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: expiryFrom(token.expires_in),
    scopes: (token.scope ?? '').split(' ').filter(Boolean)
  }
}

/** Código de autorización con PKCE. La dirección de retorno debe estar registrada en la app de X. */
export async function runXOAuth(
  client: OAuthClient,
  openUrl: (url: string) => void
): Promise<OAuthResult> {
  const result = await runLoopback({
    label: 'X',
    authorizeUrl: X_AUTHORIZE,
    params: {
      client_id: client.clientId,
      response_type: 'code',
      scope: X_SCOPES.join(' ')
    },
    redirectHost: '127.0.0.1',
    port: X_OAUTH_PORT,
    pkce: true,
    openUrl
  })
  const token = await sendJson<TokenResponse>('X', X_TOKEN, {
    method: 'POST',
    headers: clientAuthHeaders(client),
    body: formBody({
      grant_type: 'authorization_code',
      code: result.code,
      client_id: client.clientId,
      redirect_uri: result.redirectUri,
      code_verifier: result.codeVerifier ?? undefined
    })
  })
  return toResult(token)
}

/** Renueva el acceso. X devuelve un refresh token nuevo en cada renovación. */
export async function refreshXToken(
  client: OAuthClient,
  refreshToken: string
): Promise<OAuthResult> {
  const token = await sendJson<TokenResponse>('X', X_TOKEN, {
    method: 'POST',
    headers: clientAuthHeaders(client),
    body: formBody({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: client.clientId
    })
  })
  return toResult(token)
}
