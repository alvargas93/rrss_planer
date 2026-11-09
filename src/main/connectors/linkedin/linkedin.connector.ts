import { readFile, open } from 'node:fs/promises'
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
import { errorFromStatus, send, sendJson, sendOk, sleep } from '../net'

export const LI_API = 'https://api.linkedin.com'
/** Versión de la API de publicaciones (AAAAMM). La 202511 se retira el 2026-11-16. */
export const LI_VERSION = '202610'
const KB = 1024
const MB = 1024 * KB
const MAX_PIXELS = 36_152_320
export const LI_MAX_CHARS = 3000

const rule: MediaRule = {
  kinds: ['image', 'video'],
  imageMimes: ['image/jpeg', 'image/png', 'image/gif'],
  videoMimes: ['video/mp4'],
  // La documentación limita las imágenes por píxeles, no por peso.
  maxImageBytes: Number.MAX_SAFE_INTEGER,
  maxVideoBytes: 500 * MB,
  minVideoSeconds: 3,
  maxVideoSeconds: 30 * 60,
  minAspect: 0.01,
  maxAspect: 10,
  minCount: 0,
  maxCount: 1
}

/** Capacidades verificadas el 2026-11-09 (docs/connectors/linkedin.md). */
export const LINKEDIN_CAPABILITIES: Capabilities = {
  network: 'linkedin',
  kinds: { article: rule },
  maxChars: LI_MAX_CHARS,
  maxHashtags: null,
  altTextMaxChars: 4086,
  nativeScheduling: false,
  requiresPublicMediaUrl: false,
  metrics: false,
  autoRefresh: false,
  notes: [
    'Publica como tu perfil personal. Las páginas de empresa necesitan otro permiso que no se incluye todavía.',
    'Una imagen o un vídeo por publicación (vídeo MP4 de 3 s a 30 min y hasta 500 MB).',
    'LinkedIn no permite renovar el acceso sin volver a autorizar: caduca a los 60 días y la app te avisa antes.',
    'LinkedIn no ofrece métricas por API en el modo autoservicio.',
    'LinkedIn no programa: la app publica a la hora prevista con la app abierta.'
  ]
}

/**
 * El campo `commentary` usa el "little text format": los caracteres reservados deben
 * llevar barra invertida. Los hashtags se respetan tal cual.
 */
export function escapeLittle(text: string): string {
  return text.replace(/#[\p{L}\p{N}_]+|[\\|{}@[\]()<>*_~#]/gu, (match) =>
    match.length > 1 && match.startsWith('#') ? match : `\\${match}`
  )
}

const headers = (token: string, json = true): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  'Linkedin-Version': LI_VERSION,
  'X-Restli-Protocol-Version': '2.0.0',
  ...(json ? { 'Content-Type': 'application/json' } : {})
})

export class LinkedInConnector implements Connector {
  readonly network = 'linkedin' as const

  capabilities(): Capabilities {
    return LINKEDIN_CAPABILITIES
  }

  async identify(accessToken: string): Promise<ConnectedIdentity> {
    const me = await sendJson<{ sub: string; name?: string; picture?: string }>(
      'LinkedIn',
      `${LI_API}/v2/userinfo`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const name = me.name ?? me.sub
    return {
      externalId: me.sub,
      username: name,
      displayName: name,
      avatarUrl: me.picture ?? null,
      accountType: 'personal',
      scopes: [],
      tokenExpiresAt: null,
      meta: {}
    }
  }

  async refreshToken(): Promise<{ accessToken: string; expiresAt: string | null }> {
    throw new AppError(
      'UNAUTHORIZED',
      'LinkedIn no permite renovar el acceso sin volver a autorizar. Pulsa "Conectar LinkedIn" otra vez.'
    )
  }

  validate(variant: PostVariant, media: MediaAsset[]): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    if (!variant.text.trim() && media.length === 0) {
      issues.push({ level: 'error', message: 'La publicación de LinkedIn está vacía.' })
    }
    if (variant.text.length > LI_MAX_CHARS) {
      issues.push({
        level: 'error',
        message: `El texto supera los ${LI_MAX_CHARS} caracteres (${variant.text.length}).`
      })
    }
    if (media.length > 1) {
      issues.push({
        level: 'error',
        message: 'Esta versión publica un solo medio por post en LinkedIn.'
      })
    }
    for (const asset of media.slice(0, 1)) {
      if (asset.kind === 'image') {
        if (!rule.imageMimes.includes(asset.mime)) {
          issues.push({
            level: 'warning',
            message: `"${asset.originalName}" no es JPEG, PNG ni GIF: se convertirá a JPEG al publicar.`
          })
        }
        if (asset.width && asset.height && asset.width * asset.height >= MAX_PIXELS) {
          issues.push({
            level: 'error',
            message: `"${asset.originalName}" tiene demasiados píxeles (máximo 36 millones).`
          })
        }
        if (!asset.altText) {
          issues.push({
            level: 'warning',
            message: `"${asset.originalName}" no tiene texto alternativo (accesibilidad).`
          })
        }
      } else {
        if (asset.mime !== 'video/mp4') {
          issues.push({ level: 'error', message: `"${asset.originalName}" debe ser MP4.` })
        }
        if (asset.sizeBytes > rule.maxVideoBytes || asset.sizeBytes < 75 * KB) {
          issues.push({
            level: 'error',
            message: `"${asset.originalName}" debe pesar entre 75 KB y 500 MB.`
          })
        }
        if (asset.durationMs !== null) {
          const seconds = asset.durationMs / 1000
          if (seconds < 3 || seconds > 30 * 60) {
            issues.push({
              level: 'error',
              message: `"${asset.originalName}" dura ${Math.round(seconds)} s; LinkedIn exige entre 3 s y 30 min.`
            })
          }
        }
      }
    }
    return issues
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const progress = input.onProgress ?? ((): void => undefined)
    const token = input.accessToken
    const owner = `urn:li:person:${input.account.externalId}`
    const first = input.media[0]
    let content: Record<string, unknown> | undefined
    if (first) {
      progress('Subiendo el medio a LinkedIn…')
      const urn =
        first.asset.kind === 'video'
          ? await this.uploadVideo(token, owner, first.filePath, progress)
          : await this.uploadImage(token, owner, first.filePath)
      content = {
        media: { id: urn, ...(first.asset.altText ? { altText: first.asset.altText } : {}) }
      }
    }
    progress('Publicando en LinkedIn…')
    const response = await sendOk('LinkedIn', `${LI_API}/rest/posts`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        author: owner,
        commentary: escapeLittle(input.variant.text),
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: []
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
        ...(content ? { content } : {})
      })
    })
    const id = response.headers.get('x-restli-id')
    if (!id)
      throw new AppError('EXTERNAL_API', 'LinkedIn no devolvió el identificador de la publicación.')
    return { externalPostId: id, externalUrl: `https://www.linkedin.com/feed/update/${id}/` }
  }

  private async uploadImage(token: string, owner: string, filePath: string): Promise<string> {
    const init = await sendJson<{ value: { uploadUrl: string; image: string } }>(
      'LinkedIn',
      `${LI_API}/rest/images?action=initializeUpload`,
      {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({ initializeUploadRequest: { owner } })
      }
    )
    await sendOk('LinkedIn', init.value.uploadUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(await readFile(filePath)),
      timeoutMs: 5 * 60_000
    })
    return init.value.image
  }

  private async uploadVideo(
    token: string,
    owner: string,
    filePath: string,
    progress: (message: string) => void
  ): Promise<string> {
    const handle = await open(filePath, 'r')
    try {
      const size = (await handle.stat()).size
      const init = await sendJson<{
        value: {
          video: string
          uploadToken: string
          uploadInstructions: Array<{ uploadUrl: string; firstByte: number; lastByte: number }>
        }
      }>('LinkedIn', `${LI_API}/rest/videos?action=initializeUpload`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({
          initializeUploadRequest: {
            owner,
            fileSizeBytes: size,
            uploadCaptions: false,
            uploadThumbnail: false
          }
        })
      })
      const etags: string[] = []
      const parts = init.value.uploadInstructions
      for (const [index, part] of parts.entries()) {
        progress(`Subiendo el vídeo a LinkedIn: parte ${index + 1} de ${parts.length}…`)
        const length = part.lastByte - part.firstByte + 1
        const buffer = Buffer.alloc(length)
        const { bytesRead } = await handle.read(buffer, 0, length, part.firstByte)
        const response = await sendOk('LinkedIn', part.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: new Uint8Array(buffer.subarray(0, bytesRead)),
          timeoutMs: 5 * 60_000
        })
        const etag = response.headers.get('etag')
        if (!etag)
          throw new AppError(
            'EXTERNAL_API',
            'LinkedIn no devolvió la huella (ETag) de una parte del vídeo.'
          )
        etags.push(etag.replace(/^"|"$/g, ''))
      }
      await sendOk('LinkedIn', `${LI_API}/rest/videos?action=finalizeUpload`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({
          finalizeUploadRequest: {
            video: init.value.video,
            uploadToken: init.value.uploadToken,
            uploadedPartIds: etags
          }
        })
      })
      await this.waitUntilAvailable(token, init.value.video, progress)
      return init.value.video
    } finally {
      await handle.close()
    }
  }

  private async waitUntilAvailable(
    token: string,
    urn: string,
    progress: (message: string) => void
  ): Promise<void> {
    for (let attempt = 0; attempt < 120; attempt++) {
      const response = await send('LinkedIn', `${LI_API}/rest/videos/${encodeURIComponent(urn)}`, {
        headers: headers(token, false)
      })
      if (!response.ok) throw errorFromStatus('LinkedIn', response.status, await response.text())
      const video = (await response.json()) as { status?: string; processingFailureReason?: string }
      if (video.status === 'AVAILABLE') return
      if (video.status === 'PROCESSING_FAILED') {
        throw new AppError(
          'VALIDATION',
          `LinkedIn no pudo procesar el vídeo: ${video.processingFailureReason ?? 'motivo desconocido'}.`
        )
      }
      progress('LinkedIn está procesando el vídeo…')
      await sleep(5000)
    }
    throw new AppError(
      'EXTERNAL_API',
      'LinkedIn tarda demasiado en procesar el vídeo. Se reintentará.'
    )
  }
}
