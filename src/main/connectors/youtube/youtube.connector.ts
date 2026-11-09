import { open } from 'node:fs/promises'
import type {
  Capabilities,
  ConnectedIdentity,
  Connector,
  PublishInput,
  PublishResult
} from '@shared/connectors/Connector'
import type { MediaAsset } from '@shared/domain/media'
import type { PostVariant } from '@shared/domain/posts'
import type { ValidationIssue } from '@shared/domain/publishing'
import { AppError } from '@shared/domain/errors'
import { expiryFrom, type OAuthClient } from '../oauth-pkce'
import { errorFromStatus, formBody, send, sendJson, sleep } from '../net'
import { GOOGLE_TOKEN } from './oauth'
import { YoutubeAnalytics } from './youtube.analytics'
import { createLogger } from '../../log'

const log = createLogger('youtube')

export const YT_API = 'https://www.googleapis.com/youtube/v3'
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos'
/** Múltiplo de 256 KB, como exige el protocolo reanudable. */
export const CHUNK_BYTES = 8 * 1024 * 1024
const MAX_RETRIES = 5
const GB = 1024 * 1024 * 1024
const TITLE_MAX = 100
const PRIVACY = ['public', 'unlisted', 'private'] as const
type Privacy = (typeof PRIVACY)[number]

const videoRule = {
  kinds: ['video' as const],
  imageMimes: [],
  videoMimes: ['video/mp4', 'video/quicktime', 'video/webm'],
  maxImageBytes: 0,
  maxVideoBytes: 256 * GB,
  minVideoSeconds: null,
  maxVideoSeconds: null,
  minAspect: 0.01,
  maxAspect: 10,
  minCount: 1,
  maxCount: 1
}

/** Capacidades verificadas el 2026-11-09 (docs/connectors/youtube.md). */
export const YOUTUBE_CAPABILITIES: Capabilities = {
  network: 'youtube',
  kinds: { video: videoRule, short: videoRule },
  maxChars: 5000,
  maxHashtags: null,
  altTextMaxChars: null,
  nativeScheduling: true,
  requiresPublicMediaUrl: false,
  metrics: true,
  autoRefresh: true,
  notes: [
    'El título es obligatorio (hasta 100 caracteres); el texto del post es la descripción.',
    'Los Shorts son vídeos verticales cortos: YouTube los clasifica solo. La app añade #Shorts a la descripción.',
    'Programación nativa: la app sube el vídeo hasta 24 h antes (privado, con hora de publicación) y YouTube lo hace público a su hora aunque la app esté cerrada. Necesita abrir la app al menos una vez en esas 24 h.',
    'Si tu proyecto de Google no está auditado, YouTube podría dejar los vídeos subidos en privado (fuentes contradictorias). La app lo comprueba y te avisa.'
  ]
}

interface VideoResource {
  id: string
  status?: { privacyStatus?: string }
}

interface ChannelResource {
  id: string
  snippet?: { title?: string; customUrl?: string; thumbnails?: Record<string, { url: string }> }
  statistics?: {
    subscriberCount?: string
    hiddenSubscriberCount?: boolean
    viewCount?: string
    videoCount?: string
  }
}

function privacyOf(variant: PostVariant): Privacy {
  const wanted = variant.extra['privacy']
  return (PRIVACY as readonly string[]).includes(wanted ?? '') ? (wanted as Privacy) : 'public'
}

/** Lee `Range: bytes=0-N` y devuelve el siguiente byte que falta. */
export function nextOffsetFromRange(range: string | null): number {
  const match = range?.match(/bytes=0-(\d+)/)
  return match ? Number(match[1]) + 1 : 0
}

export class YoutubeConnector implements Connector {
  readonly network = 'youtube' as const
  readonly analytics = new YoutubeAnalytics()

  constructor(private readonly getClient: () => OAuthClient) {}

  capabilities(): Capabilities {
    return YOUTUBE_CAPABILITIES
  }

  async identify(accessToken: string): Promise<ConnectedIdentity> {
    const result = await sendJson<{ items?: ChannelResource[] }>(
      'YouTube',
      `${YT_API}/channels?${new URLSearchParams({ part: 'snippet,statistics', mine: 'true' })}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const channel = result.items?.[0]
    if (!channel) {
      throw new AppError(
        'VALIDATION',
        'Esa cuenta de Google no tiene un canal de YouTube. Crea uno en youtube.com y vuelve a conectar.'
      )
    }
    const handle = (channel.snippet?.customUrl ?? '').replace(/^@/, '')
    const title = channel.snippet?.title ?? handle
    const hidden = channel.statistics?.hiddenSubscriberCount === true
    return {
      externalId: channel.id,
      username: handle || title,
      displayName: title,
      avatarUrl:
        channel.snippet?.thumbnails?.['default']?.url ??
        channel.snippet?.thumbnails?.['medium']?.url ??
        null,
      accountType: 'canal',
      scopes: [],
      tokenExpiresAt: null,
      meta: {
        followersCount:
          !hidden && channel.statistics?.subscriberCount
            ? Number(channel.statistics.subscriberCount)
            : null,
        videoCount: channel.statistics?.videoCount ? Number(channel.statistics.videoCount) : null
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
        'Falta el permiso de renovación de Google. Vuelve a conectar el canal.'
      )
    }
    const client = this.getClient()
    const token = await sendJson<{ access_token: string; expires_in?: number }>(
      'Google',
      GOOGLE_TOKEN,
      {
        method: 'POST',
        body: formBody({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: client.clientId,
          client_secret: client.clientSecret || undefined
        })
      }
    )
    return { accessToken: token.access_token, expiresAt: expiryFrom(token.expires_in) }
  }

  validate(variant: PostVariant, media: MediaAsset[]): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const title = (variant.extra['title'] ?? '').trim()
    if (!title)
      issues.push({ level: 'error', message: 'YouTube necesita un título para el vídeo.' })
    if (title.length > TITLE_MAX) {
      issues.push({
        level: 'error',
        message: `El título supera los ${TITLE_MAX} caracteres (${title.length}).`
      })
    }
    if (variant.text.length > YOUTUBE_CAPABILITIES.maxChars) {
      issues.push({
        level: 'error',
        message: `La descripción supera los ${YOUTUBE_CAPABILITIES.maxChars} caracteres (${variant.text.length}).`
      })
    }
    if (media.length !== 1 || media[0]?.kind !== 'video') {
      issues.push({ level: 'error', message: 'YouTube necesita exactamente un vídeo.' })
      return issues
    }
    const asset = media[0]
    if (!videoRule.videoMimes.includes(asset.mime)) {
      issues.push({
        level: 'warning',
        message: `"${asset.originalName}" no es MP4, MOV ni WebM; YouTube podría rechazarlo.`
      })
    }
    if (variant.kind === 'short' && asset.width && asset.height && asset.width > asset.height) {
      issues.push({
        level: 'warning',
        message: `"${asset.originalName}" es horizontal: YouTube no lo tratará como Short (necesita formato vertical).`
      })
    }
    return issues
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const first = input.media[0]
    if (!first) throw new AppError('VALIDATION', 'Falta el vídeo.')
    const progress = input.onProgress ?? ((): void => undefined)
    const { variant } = input
    // Para programar, YouTube exige que el vídeo se suba como privado con `publishAt`.
    const privacy: Privacy = input.publishAt ? 'private' : privacyOf(variant)
    const description =
      variant.kind === 'short' && !/#shorts/i.test(variant.text)
        ? `${variant.text}\n\n#Shorts`.trim()
        : variant.text
    const handle = await open(first.filePath, 'r')
    try {
      const total = (await handle.stat()).size
      progress('Abriendo la subida a YouTube…')
      const session = await send(
        'YouTube',
        `${UPLOAD_URL}?${new URLSearchParams({ uploadType: 'resumable', part: 'snippet,status' })}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Length': String(total),
            'X-Upload-Content-Type': first.asset.mime
          },
          body: JSON.stringify({
            snippet: {
              title: (variant.extra['title'] ?? '').trim(),
              description,
              // 22 = "Gente y blogs", categoría genérica (no consta en la página leída que sea opcional).
              categoryId: '22'
            },
            status: {
              privacyStatus: privacy,
              selfDeclaredMadeForKids: false,
              ...(input.publishAt ? { publishAt: input.publishAt } : {})
            }
          })
        }
      )
      if (!session.ok) throw errorFromStatus('YouTube', session.status, await session.text())
      const sessionUri = session.headers.get('location')
      if (!sessionUri)
        throw new AppError('EXTERNAL_API', 'YouTube no devolvió la dirección de subida.')

      const video = await this.upload({
        sessionUri,
        total,
        mime: first.asset.mime,
        read: async (start, length) => {
          const buffer = Buffer.alloc(length)
          await handle.read(buffer, 0, length, start)
          return buffer
        },
        progress
      })

      const notice =
        video.status?.privacyStatus && video.status.privacyStatus !== privacy
          ? `YouTube ha dejado el vídeo como "${video.status.privacyStatus}" aunque se pidió "${privacy}". Suele pasar con proyectos de Google sin auditar: tendrás que cambiarlo a mano en YouTube Studio.`
          : null
      if (notice) log.warn(notice)
      return {
        externalPostId: video.id,
        externalUrl:
          variant.kind === 'short'
            ? `https://www.youtube.com/shorts/${video.id}`
            : `https://www.youtube.com/watch?v=${video.id}`,
        notice
      }
    } finally {
      await handle.close()
    }
  }

  /** Subida reanudable por trozos con reintentos y consulta de estado tras un corte. */
  private async upload(args: {
    sessionUri: string
    total: number
    mime: string
    read: (start: number, length: number) => Promise<Buffer>
    progress: (message: string) => void
  }): Promise<VideoResource> {
    const { sessionUri, total, mime } = args
    let offset = 0
    let failures = 0
    for (;;) {
      const end = Math.min(offset + CHUNK_BYTES, total) - 1
      const body = await args.read(offset, end - offset + 1)
      let response: Response | null = null
      try {
        response = await send('YouTube', sessionUri, {
          method: 'PUT',
          headers: { 'Content-Range': `bytes ${offset}-${end}/${total}`, 'Content-Type': mime },
          body: new Uint8Array(body),
          timeoutMs: 5 * 60_000
        })
      } catch (error) {
        log.warn(`Corte durante la subida: ${AppError.from(error).message}`)
      }
      if (response && (response.status === 200 || response.status === 201)) {
        return (await response.json()) as VideoResource
      }
      if (response?.status === 308) {
        failures = 0
        offset = nextOffsetFromRange(response.headers.get('range'))
        args.progress(`Subiendo a YouTube: ${Math.round((offset / total) * 100)} %`)
        continue
      }
      if (response?.status === 404) {
        throw new AppError(
          'EXTERNAL_API',
          'La sesión de subida de YouTube caducó. Se reintentará desde el principio.'
        )
      }
      if (response && response.status < 500) {
        throw errorFromStatus('YouTube', response.status, await response.text())
      }
      // Corte de red o 5xx: esperar y preguntar a YouTube qué recibió.
      failures++
      if (failures > MAX_RETRIES) {
        throw new AppError('EXTERNAL_API', 'La subida a YouTube se interrumpió demasiadas veces.')
      }
      await sleep(Math.min(2 ** failures * 1000, 30_000))
      const status = await send('YouTube', sessionUri, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes */${total}` }
      }).catch(() => null)
      if (status && (status.status === 200 || status.status === 201)) {
        return (await status.json()) as VideoResource
      }
      if (status?.status === 308) offset = nextOffsetFromRange(status.headers.get('range'))
    }
  }
}
