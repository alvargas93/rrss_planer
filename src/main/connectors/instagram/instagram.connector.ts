import type {
  Capabilities,
  ConnectedIdentity,
  Connector,
  MediaRule,
  PublishInput,
  PublishResult
} from '@shared/connectors/Connector'
import { extractHashtags, type PostKind } from '@shared/connectors/networks'
import type { MediaAsset } from '@shared/domain/media'
import type { PostVariant } from '@shared/domain/posts'
import type { ValidationIssue } from '@shared/domain/publishing'
import { AppError } from '@shared/domain/errors'
import { InstagramApi } from './instagram.api'
import { InstagramAnalytics } from './instagram.analytics'

const MB = 1024 * 1024
const LONG_LIVED_SECONDS = 60 * 24 * 60 * 60

const image: Omit<MediaRule, 'minCount' | 'maxCount' | 'kinds'> = {
  imageMimes: ['image/jpeg'],
  videoMimes: [],
  maxImageBytes: 8 * MB,
  maxVideoBytes: 0,
  minVideoSeconds: null,
  maxVideoSeconds: null,
  minAspect: 0.8, // 4:5
  maxAspect: 1.91
}

const video = {
  videoMimes: ['video/mp4', 'video/quicktime'],
  maxVideoBytes: 300 * MB,
  minVideoSeconds: 3,
  maxVideoSeconds: 15 * 60,
  minAspect: 0.01,
  maxAspect: 10
}

/** Capacidades verificadas el 2026-11-06 (docs/connectors/instagram.md §4). */
export const INSTAGRAM_CAPABILITIES: Capabilities = {
  network: 'instagram',
  kinds: {
    feed: {
      ...image,
      kinds: ['image', 'video'],
      videoMimes: video.videoMimes,
      maxVideoBytes: video.maxVideoBytes,
      minVideoSeconds: 3,
      maxVideoSeconds: 15 * 60,
      minCount: 1,
      maxCount: 1
    },
    carousel: {
      ...image,
      kinds: ['image', 'video'],
      videoMimes: video.videoMimes,
      maxVideoBytes: video.maxVideoBytes,
      minVideoSeconds: 3,
      maxVideoSeconds: 15 * 60,
      minCount: 2,
      maxCount: 10
    },
    reel: {
      kinds: ['video'],
      imageMimes: [],
      ...video,
      maxImageBytes: 0,
      minCount: 1,
      maxCount: 1
    },
    story: {
      kinds: ['image', 'video'],
      imageMimes: ['image/jpeg'],
      videoMimes: video.videoMimes,
      maxImageBytes: 8 * MB,
      maxVideoBytes: 100 * MB,
      minVideoSeconds: 3,
      maxVideoSeconds: 60,
      minAspect: 0.1,
      maxAspect: 10,
      minCount: 1,
      maxCount: 1
    }
  },
  maxChars: 2200,
  maxHashtags: 30,
  altTextMaxChars: 1000,
  nativeScheduling: false,
  requiresPublicMediaUrl: true,
  metrics: true,
  notes: [
    'Solo imágenes JPEG; PNG y WebP se convierten antes de publicar.',
    'Instagram no programa por sí mismo: la app debe estar abierta (o en la bandeja) a la hora prevista.',
    'Los carruseles no devuelven métricas por API.',
    'Cupo: 100 publicaciones por API cada 24 h (según la documentación; puede ser 50).'
  ]
}

function kindOf(variant: PostVariant): PostKind {
  return variant.kind
}

export class InstagramConnector implements Connector {
  readonly network = 'instagram' as const
  readonly analytics = new InstagramAnalytics()

  capabilities(): Capabilities {
    return INSTAGRAM_CAPABILITIES
  }

  async identify(accessToken: string): Promise<ConnectedIdentity> {
    const me = await new InstagramApi(accessToken).me()
    const externalId = me.user_id ?? me.id
    return {
      externalId,
      username: me.username,
      displayName: me.name ?? me.username,
      avatarUrl: me.profile_picture_url ?? null,
      accountType: (me.account_type ?? 'unknown').toLowerCase(),
      scopes: [],
      tokenExpiresAt: null,
      meta: {
        followersCount: me.followers_count ?? null,
        followsCount: me.follows_count ?? null,
        mediaCount: me.media_count ?? null,
        graphId: me.id
      }
    }
  }

  async refreshToken(
    accessToken: string
  ): Promise<{ accessToken: string; expiresAt: string | null }> {
    const result = await new InstagramApi(accessToken).refresh()
    const seconds = result.expires_in || LONG_LIVED_SECONDS
    return {
      accessToken: result.access_token,
      expiresAt: new Date(Date.now() + seconds * 1000).toISOString()
    }
  }

  validate(variant: PostVariant, media: MediaAsset[]): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const caps = INSTAGRAM_CAPABILITIES
    const rule = caps.kinds[kindOf(variant)]
    if (!rule) {
      issues.push({
        level: 'error',
        message: `Instagram no admite el formato "${variant.kind}" por API.`
      })
      return issues
    }
    if (variant.text.length > caps.maxChars) {
      issues.push({
        level: 'error',
        message: `El pie supera los ${caps.maxChars} caracteres (${variant.text.length}).`
      })
    }
    const tags = extractHashtags(variant.text).length
    if (caps.maxHashtags !== null && tags > caps.maxHashtags) {
      issues.push({
        level: 'error',
        message: `Demasiados hashtags: ${tags} (máximo ${caps.maxHashtags}).`
      })
    }
    if (media.length < rule.minCount) {
      issues.push({
        level: 'error',
        message: `Este formato necesita al menos ${rule.minCount} archivo${rule.minCount > 1 ? 's' : ''}.`
      })
    }
    if (media.length > rule.maxCount) {
      issues.push({
        level: 'error',
        message: `Demasiados archivos: ${media.length} (máximo ${rule.maxCount}).`
      })
    }
    for (const asset of media.slice(0, rule.maxCount)) {
      if (!rule.kinds.includes(asset.kind)) {
        issues.push({
          level: 'error',
          message: `"${asset.originalName}": este formato no admite ${asset.kind === 'image' ? 'imágenes' : 'vídeos'}.`
        })
        continue
      }
      if (asset.kind === 'image') {
        if (!rule.imageMimes.includes(asset.mime)) {
          issues.push({
            level: 'warning',
            message: `"${asset.originalName}" no es JPEG: se convertirá automáticamente al publicar.`
          })
        }
        if (asset.sizeBytes > rule.maxImageBytes) {
          issues.push({
            level: 'error',
            message: `"${asset.originalName}" pesa más de ${Math.round(rule.maxImageBytes / MB)} MB.`
          })
        }
        if (asset.width && asset.height) {
          const aspect = asset.width / asset.height
          if (aspect < rule.minAspect - 0.005 || aspect > rule.maxAspect + 0.005) {
            issues.push({
              level: 'error',
              message: `"${asset.originalName}" tiene proporción ${aspect.toFixed(2)}; Instagram exige entre 4:5 (0,80) y 1.91:1.`
            })
          }
        }
        if (caps.altTextMaxChars !== null && asset.altText.length > caps.altTextMaxChars) {
          issues.push({
            level: 'error',
            message: `El texto alternativo de "${asset.originalName}" supera ${caps.altTextMaxChars} caracteres.`
          })
        }
        if (!asset.altText && variant.kind !== 'story') {
          issues.push({
            level: 'warning',
            message: `"${asset.originalName}" no tiene texto alternativo (accesibilidad).`
          })
        }
      } else {
        if (!rule.videoMimes.includes(asset.mime)) {
          issues.push({ level: 'error', message: `"${asset.originalName}" debe ser MP4 o MOV.` })
        }
        if (asset.sizeBytes > rule.maxVideoBytes) {
          issues.push({
            level: 'error',
            message: `"${asset.originalName}" pesa más de ${Math.round(rule.maxVideoBytes / MB)} MB.`
          })
        }
        if (asset.durationMs === null) {
          issues.push({
            level: 'warning',
            message: `No se conoce la duración de "${asset.originalName}"; Instagram exige entre ${rule.minVideoSeconds} s y ${rule.maxVideoSeconds} s.`
          })
        } else {
          const seconds = asset.durationMs / 1000
          if (
            (rule.minVideoSeconds !== null && seconds < rule.minVideoSeconds) ||
            (rule.maxVideoSeconds !== null && seconds > rule.maxVideoSeconds)
          ) {
            issues.push({
              level: 'error',
              message: `"${asset.originalName}" dura ${Math.round(seconds)} s; debe durar entre ${rule.minVideoSeconds} y ${rule.maxVideoSeconds} s.`
            })
          }
        }
      }
    }
    return issues
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const api = new InstagramApi(input.accessToken)
    const igId = input.account.externalId
    const caption = input.variant.text
    const kind = kindOf(input.variant)
    const progress = input.onProgress ?? ((): void => undefined)
    const first = input.media[0]

    let creationId: string

    if (kind === 'carousel') {
      const children: string[] = []
      for (const item of input.media) {
        progress(`Subiendo ${children.length + 1} de ${input.media.length}…`)
        const id = await api.createContainer(igId, {
          is_carousel_item: true,
          ...(item.asset.kind === 'video'
            ? { media_type: 'VIDEO', video_url: item.publicUrl }
            : { image_url: item.publicUrl, alt_text: item.asset.altText || undefined })
        })
        if (item.asset.kind === 'video') await api.waitUntilReady(id, progress)
        children.push(id)
      }
      creationId = await api.createContainer(igId, {
        media_type: 'CAROUSEL',
        children: children.join(','),
        caption
      })
    } else if (kind === 'reel' || (kind === 'feed' && first?.asset.kind === 'video')) {
      if (!first) throw new AppError('VALIDATION', 'Falta el vídeo del reel.')
      progress('Enviando el vídeo a Instagram…')
      creationId = await api.createContainer(igId, {
        media_type: 'REELS',
        video_url: first.publicUrl,
        caption,
        share_to_feed: true
      })
      await api.waitUntilReady(creationId, progress)
    } else if (kind === 'story') {
      if (!first) throw new AppError('VALIDATION', 'Falta el archivo de la historia.')
      progress('Enviando la historia a Instagram…')
      creationId = await api.createContainer(igId, {
        media_type: 'STORIES',
        ...(first.asset.kind === 'video'
          ? { video_url: first.publicUrl }
          : { image_url: first.publicUrl })
      })
      if (first.asset.kind === 'video') await api.waitUntilReady(creationId, progress)
    } else {
      if (!first) throw new AppError('VALIDATION', 'Falta la imagen de la publicación.')
      progress('Enviando la imagen a Instagram…')
      creationId = await api.createContainer(igId, {
        image_url: first.publicUrl,
        caption,
        alt_text: first.asset.altText || undefined
      })
    }

    progress('Publicando…')
    const mediaId = await api.publish(igId, creationId)
    const permalink = await api.permalink(mediaId)
    return { externalPostId: mediaId, externalUrl: permalink }
  }
}
