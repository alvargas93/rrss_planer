import { expiryFrom, runLoopback, type OAuthClient, type OAuthResult } from '../oauth-pkce'
import { formBody, sendJson } from '../net'

export const GOOGLE_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'

/** Scopes verificados en docs/connectors/youtube.md. */
export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly'
]

interface TokenResponse {
  access_token: string
  expires_in?: number
  refresh_token?: string
  scope?: string
}

/** Autorización de Google para apps de escritorio: loopback + PKCE. */
export async function runYoutubeOAuth(
  client: OAuthClient,
  openUrl: (url: string) => void
): Promise<OAuthResult> {
  const result = await runLoopback({
    label: 'Google',
    authorizeUrl: GOOGLE_AUTHORIZE,
    params: {
      client_id: client.clientId,
      response_type: 'code',
      scope: YOUTUBE_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent'
    },
    redirectHost: '127.0.0.1',
    port: 0,
    pkce: true,
    openUrl
  })
  const token = await sendJson<TokenResponse>('Google', GOOGLE_TOKEN, {
    method: 'POST',
    body: formBody({
      grant_type: 'authorization_code',
      code: result.code,
      client_id: client.clientId,
      client_secret: client.clientSecret || undefined,
      redirect_uri: result.redirectUri,
      code_verifier: result.codeVerifier ?? undefined
    })
  })
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: expiryFrom(token.expires_in),
    scopes: (token.scope ?? '').split(' ').filter(Boolean)
  }
}
