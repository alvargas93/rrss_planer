import { expiryFrom, runLoopback, type OAuthClient, type OAuthResult } from '../oauth-pkce'
import { formBody, sendJson } from '../net'

export const LINKEDIN_AUTHORIZE = 'https://www.linkedin.com/oauth/v2/authorization'
export const LINKEDIN_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken'
export const LINKEDIN_OAUTH_PORT = 47822

/** Scopes verificados en docs/connectors/linkedin.md. */
export const LINKEDIN_SCOPES = ['openid', 'profile', 'w_member_social']

interface TokenResponse {
  access_token: string
  expires_in?: number
  refresh_token?: string
  scope?: string
}

/**
 * Código de autorización de tres patas. [no confirmado] que LinkedIn acepte
 * http://localhost como redirección; si falla, se conecta con el token del portal.
 */
export async function runLinkedInOAuth(
  client: OAuthClient,
  openUrl: (url: string) => void
): Promise<OAuthResult> {
  const result = await runLoopback({
    label: 'LinkedIn',
    authorizeUrl: LINKEDIN_AUTHORIZE,
    params: {
      client_id: client.clientId,
      response_type: 'code',
      scope: LINKEDIN_SCOPES.join(' ')
    },
    redirectHost: 'localhost',
    port: LINKEDIN_OAUTH_PORT,
    pkce: false,
    openUrl
  })
  const token = await sendJson<TokenResponse>('LinkedIn', LINKEDIN_TOKEN, {
    method: 'POST',
    body: formBody({
      grant_type: 'authorization_code',
      code: result.code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: result.redirectUri
    })
  })
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: expiryFrom(token.expires_in),
    scopes: (token.scope ?? '').split(/[ ,]/).filter(Boolean)
  }
}
