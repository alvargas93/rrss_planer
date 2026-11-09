import { open } from 'node:fs/promises'
import type {
  Capabilities,
  ConnectedIdentity,
  Connector,
  MediaRule,
  PublishInput,
  PublishResult
} from '@shared/connectors/Connector'
import type { MediaAsset } from '@shared/domain/media'
import type { PostVariant } from '@shared/domain/posts'
import type { ValidationIssue } from '@shared/domain/publishing'
import { AppError } from '@shared/domain/errors'
import type { OAuthClient } from '../oauth-pkce'
import { send, sendJson, sendOk, sleep } from '../net'
import { refreshXToken } from './oauth'

export const X_API = 'https://api.x.com'
const MB = 1024 * 1024
const GB = 1024 * MB
/** Límite de un trozo según la documentación de X. */
export const X_CHUNK_BYTES = 5 * MB
export const X_SOFT_CHARS = 280
export const X_HARD_CHARS = 4000

const thread: MediaRule = {
  kinds: ['image', 'video'],
  imageMimes: ['image/jpeg', 'image/png', 'image/gif'],
  videoMimes: ['video/mp4', 'video/quicktime'],
  maxImageBytes: 5 * MB,
  maxVideoBytes: 8 * GB,
  minVideoSeconds: null,
  maxVideoSeconds: 20 * 60,
  minAspect: 0.01,
  maxAspect: 10,
  minCount: 0,
  maxCount: 4
}

/** Capacidades verificadas el 2026-11-09 (docs/connectors/x.md). */
export const X_CAPABILITIES: Capabilities = {
  network: 'x',
  kinds: { thread },
  maxChars: X_SOFT_CHARS,
  maxHashtags: null,
  altTextMaxChars: null,
  nativeScheduling: false,
  requiresPublicMediaUrl: false,
  metrics: false,
  autoRefresh: true,
  notes: [
    'X cobra por uso: publicar cuesta 0,015 $ y 0,20 $ si el post lleva un enlace. Necesitas saldo en la consola de desarrolladores.',
    'Hasta 4 fotos, o 1 GIF, o 1 vídeo por post. Vídeo de hasta 20 minutos (125 con Premium).',
    '280 caracteres; las cuentas Premium admiten más (no consta el límite en la documentación).',
    'Esta versión publica un único post, no hilos largos, y no lee métricas (la lectura también se cobra).',
    'El texto alternativo de las imágenes no se envía todavía.'
  ]
}

const hasUrl = (text: string): boolean => /https?:\/\/\S+/i.test(text)

export function mediaCategory(asset: MediaAsset): 'tweet_image' | 'tweet_gif' | 'tweet_video' {
  if (asset.kind === 'video') return 'tweet_video'
  return asset.mime === 'image/gif' ? 'tweet_gif' : 'tweet_image'
}

export class XConnector implements Connector {
  readonly network = 'x' as const

  constructor(private readonly getClient: () => OAuthClient) {}

  capabilities(): Capabilities {
    return X_CAPABILITIES
  }

  async identify(accessToken: string): Promise<ConnectedIdentity> {
    const result = await sendJson<{
      data: {
        id: string
        name: string
        username: string
        profile_image_url?: string
        public_metrics?: { followers_count?: number; tweet_count?: number }
      }
    }>(
      'X',
      `${X_API}/2/users/me?${new URLSearchParams({ 'user.fields': 'profile_image_url,public_metrics' })}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
    const user = result.data
    return {
      externalId: user.id,
      username: user.username,
      displayName: user.name,
      avatarUrl: user.profile_image_url ?? null,
      accountType: 'personal',
      scopes: [],
      tokenExpiresAt: null,
      meta: {
        followersCount: user.public_metrics?.followers_count ?? null,
        mediaCount: user.public_metrics?.tweet_count ?? null
      }
    }
  }

  async refreshToken(
    _accessToken: string,
    refreshToken?: string | null
  ): Promise<{ accessToken: string; expiresAt: string | null; refreshToken?: string | null }> {
    if (!refreshToken) {
      throw new AppError(
        'UNAUTHORIZED',
        'Falta el permiso de renovación de X. Vuelve a conectar la cuenta.'
      )
    }
    const result = await refreshXToken(this.getClient(), refreshToken)
    return {
      accessToken: result.accessToken,
      expiresAt: result.expiresAt,
      refreshToken: result.refreshToken
    }
  }

  validate(variant: PostVariant, media: MediaAsset[]): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const text = variant.text.trim()
    if (!text && media.length === 0) {
      issues.push({ level: 'error', message: 'El post de X está vacío: añade texto o un medio.' })
    }
    if (text.length > X_HARD_CHARS) {
      issues.push({
        level: 'error',
        message: `El texto supera los ${X_HARD_CHARS} caracteres (${text.length}).`
      })
    } else if (text.length > X_SOFT_CHARS) {
      issues.push({
        level: 'warning',
        message: `El texto tiene ${text.length} caracteres: pasar de ${X_SOFT_CHARS} solo funciona con una cuenta Premium.`
      })
    }
    if (hasUrl(text)) {
      issues.push({
        level: 'warning',
        message: 'Un post de X con enlace cuesta 0,20 $ en lugar de 0,015 $.'
      })
    }
    const images = media.filter((m) => m.kind === 'image' && m.mime !== 'image/gif')
    const gifs = media.filter((m) => m.mime === 'image/gif')
    const videos = media.filter((m) => m.kind === 'video')
    if (videos.length > 1 || gifs.length > 1) {
      issues.push({ level: 'error', message: 'X admite un solo vídeo o un solo GIF por post.' })
    }
    if (videos.length + gifs.length > 0 && media.length > 1) {
      issues.push({ level: 'error', message: 'X no permite mezclar vídeo o GIF con otros medios.' })
    }
    if (images.length > 4) {
      issues.push({ level: 'error', message: `X admite hasta 4 fotos (hay ${images.length}).` })
    }
    for (const asset of media) {
      if (asset.kind === 'image') {
        const limit = asset.mime === 'image/gif' ? 15 * MB : thread.maxImageBytes
        if (asset.sizeBytes > limit) {
          issues.push({
            level: 'error',
            message: `"${asset.originalName}" pesa más de ${Math.round(limit / MB)} MB.`
          })
        }
        if (!thread.imageMimes.includes(asset.mime)) {
          issues.push({
            level: 'warning',
            message: `"${asset.originalName}" no es JPEG, PNG ni GIF: se convertirá a JPEG al publicar.`
          })
        }
      } else {
        if (!thread.videoMimes.includes(asset.mime)) {
          issues.push({ level: 'error', message: `"${asset.originalName}" debe ser MP4 o MOV.` })
        }
        if (asset.sizeBytes > thread.maxVideoBytes) {
          issues.push({ level: 'error', message: `"${asset.originalName}" pesa más de 8 GB.` })
        }
        if (asset.durationMs !== null && asset.durationMs / 1000 > 20 * 60) {
          issues.push({
            level: 'warning',
            message: `"${asset.originalName}" dura más de 20 minutos: solo lo admiten las cuentas Premium.`
          })
        }
      }
    }
    return issues
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const progress = input.onProgress ?? ((): void => undefined)
    const ids: string[] = []
    for (const [index, item] of input.media.entries()) {
      progress(`Subiendo medio ${index + 1} de ${input.media.length} a X…`)
      ids.push(await this.uploadMedia(input.accessToken, item.filePath, item.asset))
    }
    progress('Publicando en X…')
    const text = input.variant.text.trim()
    const created = await sendJson<{ data: { id: string } }>('X', `${X_API}/2/tweets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(text ? { text } : {}),
        ...(ids.length > 0 ? { media: { media_ids: ids } } : {})
      })
    })
    return {
      externalPostId: created.data.id,
      externalUrl: `https://x.com/${input.account.username}/status/${created.data.id}`
    }
  }

  /** Subida v2 por fragmentos: initialize → append → finalize → estado. */
  private async uploadMedia(token: string, filePath: string, asset: MediaAsset): Promise<string> {
    const authHeader = { Authorization: `Bearer ${token}` }
    const handle = await open(filePath, 'r')
    try {
      const total = (await handle.stat()).size
      const init = await sendJson<{ data: { id: string } }>(
        'X',
        `${X_API}/2/media/upload/initialize`,
        {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: asset.mime,
            total_bytes: total,
            media_category: mediaCategory(asset)
          })
        }
      )
      const id = init.data.id
      for (let offset = 0, segment = 0; offset < total; offset += X_CHUNK_BYTES, segment++) {
        const length = Math.min(X_CHUNK_BYTES, total - offset)
        const buffer = Buffer.alloc(length)
        await handle.read(buffer, 0, length, offset)
        const form = new FormData()
        form.set('segment_index', String(segment))
        form.set('media', new Blob([new Uint8Array(buffer)]), `chunk${segment}`)
        await sendOk('X', `${X_API}/2/media/upload/${id}/append`, {
          method: 'POST',
          headers: authHeader,
          body: form,
          timeoutMs: 5 * 60_000
        })
      }
      const finalized = await sendJson<{ data: { processing_info?: ProcessingInfo } }>(
        'X',
        `${X_API}/2/media/upload/${id}/finalize`,
        { method: 'POST', headers: authHeader }
      )
      let info = finalized.data.processing_info
      for (let i = 0; info && info.state !== 'succeeded' && i < 120; i++) {
        if (info.state === 'failed') {
          throw new AppError(
            'VALIDATION',
            `X no pudo procesar el medio: ${info.error?.message ?? 'error desconocido'}.`
          )
        }
        await sleep(Math.max(1, info.check_after_secs ?? 2) * 1000)
        const status = await send(
          'X',
          `${X_API}/2/media/upload?${new URLSearchParams({ command: 'STATUS', media_id: id })}`,
          {
            headers: authHeader
          }
        )
        if (!status.ok)
          throw new AppError(
            'EXTERNAL_API',
            `X no devolvió el estado del medio (${status.status}).`
          )
        info = ((await status.json()) as { data: { processing_info?: ProcessingInfo } }).data
          .processing_info
      }
      return id
    } finally {
      await handle.close()
    }
  }
}

interface ProcessingInfo {
  state: 'pending' | 'in_progress' | 'succeeded' | 'failed'
  check_after_secs?: number
  error?: { message?: string }
}
