import { requestJson, sleep } from '../http'
import { AppError } from '@shared/domain/errors'

/**
 * Cliente mínimo de la Instagram API con Instagram Login (host graph.instagram.com).
 * Verificado contra la documentación el 2026-11-06 (ver docs/connectors/instagram.md).
 */
export const IG_API_VERSION = 'v27.0'
export const IG_GRAPH = `https://graph.instagram.com/${IG_API_VERSION}`
export const IG_OAUTH_AUTHORIZE = 'https://www.instagram.com/oauth/authorize'
export const IG_OAUTH_TOKEN = 'https://api.instagram.com/oauth/access_token'

export const IG_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_insights'
] as const

export interface IgMe {
  id: string
  user_id?: string
  username: string
  name?: string
  account_type?: string
  profile_picture_url?: string
  followers_count?: number
  follows_count?: number
  media_count?: number
}

export interface IgContainerStatus {
  id: string
  status_code: 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED'
  status?: string
}

export type ContainerParams = Record<string, string | number | boolean | undefined>

export class InstagramApi {
  constructor(private readonly accessToken: string) {}

  private auth(params: ContainerParams = {}): ContainerParams {
    return { ...params, access_token: this.accessToken }
  }

  /**
   * Identidad de la cuenta. Primero pide todos los campos conocidos; si la API
   * rechaza alguno (varían entre versiones), repite con el mínimo documentado.
   */
  async me(): Promise<IgMe> {
    const full =
      'id,user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count'
    try {
      return await requestJson<IgMe>(`${IG_GRAPH}/me`, { params: this.auth({ fields: full }) })
    } catch (error) {
      if (error instanceof AppError && error.code === 'EXTERNAL_API') {
        return requestJson<IgMe>(`${IG_GRAPH}/me`, {
          params: this.auth({ fields: 'id,user_id,username' })
        })
      }
      throw error
    }
  }

  /** Crea un contenedor de medio. Devuelve su id. */
  async createContainer(igUserId: string, params: ContainerParams): Promise<string> {
    const result = await requestJson<{ id: string }>(`${IG_GRAPH}/${igUserId}/media`, {
      method: 'POST',
      params: this.auth(params),
      timeoutMs: 120_000
    })
    return result.id
  }

  containerStatus(containerId: string): Promise<IgContainerStatus> {
    return requestJson<IgContainerStatus>(`${IG_GRAPH}/${containerId}`, {
      params: this.auth({ fields: 'id,status_code,status' })
    })
  }

  /**
   * Espera a que un contenedor de vídeo esté listo. La documentación recomienda
   * consultar una vez por minuto durante un máximo de 5 minutos; usamos 15 s.
   */
  async waitUntilReady(containerId: string, onProgress?: (m: string) => void): Promise<void> {
    const started = Date.now()
    const maxMs = 5 * 60_000
    while (Date.now() - started < maxMs) {
      const status = await this.containerStatus(containerId)
      if (status.status_code === 'FINISHED' || status.status_code === 'PUBLISHED') return
      if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
        throw new AppError(
          'VALIDATION',
          `Instagram no pudo procesar el vídeo: ${status.status ?? status.status_code}`
        )
      }
      onProgress?.('Instagram está procesando el vídeo…')
      await sleep(15_000)
    }
    throw new AppError(
      'EXTERNAL_API',
      'Instagram tardó más de 5 minutos en procesar el vídeo. Reintenta más tarde.'
    )
  }

  async publish(igUserId: string, creationId: string): Promise<string> {
    const result = await requestJson<{ id: string }>(`${IG_GRAPH}/${igUserId}/media_publish`, {
      method: 'POST',
      params: this.auth({ creation_id: creationId }),
      timeoutMs: 120_000
    })
    return result.id
  }

  async permalink(mediaId: string): Promise<string | null> {
    try {
      const result = await requestJson<{ permalink?: string }>(`${IG_GRAPH}/${mediaId}`, {
        params: this.auth({ fields: 'id,permalink' })
      })
      return result.permalink ?? null
    } catch {
      return null
    }
  }

  publishingLimit(
    igUserId: string
  ): Promise<{ data: Array<{ quota_usage: number; config?: { quota_total: number } }> }> {
    return requestJson(`${IG_GRAPH}/${igUserId}/content_publishing_limit`, {
      params: this.auth({ fields: 'quota_usage,config' })
    })
  }

  /** Token largo nuevo (60 días). Exige que el actual tenga más de 24 h. */
  refresh(): Promise<{ access_token: string; token_type: string; expires_in: number }> {
    return requestJson(`https://graph.instagram.com/refresh_access_token`, {
      params: this.auth({ grant_type: 'ig_refresh_token' })
    })
  }

  /** Canjea un token corto (1 h) por uno largo (60 días). */
  static exchangeForLongLived(
    shortToken: string,
    appSecret: string
  ): Promise<{ access_token: string; token_type: string; expires_in: number }> {
    return requestJson(`https://graph.instagram.com/access_token`, {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: appSecret,
        access_token: shortToken
      }
    })
  }

  /** Canjea el código de OAuth por un token corto. */
  static async exchangeCode(input: {
    appId: string
    appSecret: string
    redirectUri: string
    code: string
  }): Promise<{ access_token: string; user_id: string; permissions?: string[] }> {
    const result = await requestJson<{
      data?: Array<{ access_token: string; user_id: string; permissions?: string[] }>
      access_token?: string
      user_id?: string
      permissions?: string[]
    }>(IG_OAUTH_TOKEN, {
      method: 'POST',
      params: {
        client_id: input.appId,
        client_secret: input.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: input.redirectUri,
        code: input.code
      }
    })
    const entry = result.data?.[0] ?? result
    if (!entry.access_token || !entry.user_id) {
      throw new AppError('EXTERNAL_API', 'Instagram no devolvió un token al canjear el código.')
    }
    return {
      access_token: entry.access_token,
      user_id: entry.user_id,
      permissions: entry.permissions
    }
  }
}
