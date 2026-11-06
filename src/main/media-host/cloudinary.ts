import { openAsBlob } from 'node:fs'
import type { MediaAsset } from '@shared/domain/media'
import { AppError } from '@shared/domain/errors'
import { createLogger } from '../log'
import type { HostedMedia, MediaHost } from './media-host'

const log = createLogger('cloudinary')

export interface CloudinaryCredentials {
  cloudName: string
  apiKey: string
  apiSecret: string
}

interface UploadResponse {
  public_id: string
  secure_url: string
  resource_type: string
  bytes?: number
}

/**
 * Cloudinary vía Upload API REST con autenticación básica (documentada como la forma
 * más sencilla desde backend). Verificado el 2026-11-06:
 *   POST https://api.cloudinary.com/v1_1/<cloud>/<resource_type>/upload
 *   POST https://api.cloudinary.com/v1_1/<cloud>/<resource_type>/destroy
 * Archivos de más de 100 MB exigen subida por partes: de momento se rechazan con aviso.
 */
export class CloudinaryMediaHost implements MediaHost {
  readonly kind = 'cloudinary' as const
  private static readonly MAX_SINGLE_UPLOAD = 100 * 1024 * 1024

  constructor(private readonly credentials: () => CloudinaryCredentials | null) {}

  isConfigured(): boolean {
    const c = this.credentials()
    return !!c && !!c.cloudName && !!c.apiKey && !!c.apiSecret
  }

  private creds(): CloudinaryCredentials {
    const c = this.credentials()
    if (!c || !c.cloudName || !c.apiKey || !c.apiSecret) {
      throw new AppError(
        'NOT_CONFIGURED',
        'Cloudinary no está configurado (Ajustes → Alojamiento de medios).'
      )
    }
    return c
  }

  private authHeader(c: CloudinaryCredentials): string {
    return `Basic ${Buffer.from(`${c.apiKey}:${c.apiSecret}`).toString('base64')}`
  }

  async upload(asset: MediaAsset, filePath: string): Promise<HostedMedia> {
    const c = this.creds()
    if (asset.sizeBytes > CloudinaryMediaHost.MAX_SINGLE_UPLOAD) {
      throw new AppError(
        'VALIDATION',
        `"${asset.originalName}" supera 100 MB; el alojamiento temporal aún no admite archivos tan grandes.`
      )
    }
    const resourceType = asset.kind === 'video' ? 'video' : 'image'
    const form = new FormData()
    form.set('file', await openAsBlob(filePath, { type: asset.mime }), asset.fileName)
    form.set('public_id', `rrss-planner/${asset.id}`)
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${c.cloudName}/${resourceType}/upload`,
      {
        method: 'POST',
        headers: { Authorization: this.authHeader(c) },
        body: form
      }
    )
    const text = await response.text()
    if (!response.ok) {
      log.warn(`Cloudinary respondió ${response.status}`, text.slice(0, 300))
      if (response.status === 401)
        throw new AppError(
          'UNAUTHORIZED',
          'Cloudinary rechazó las credenciales. Revisa cloud name, API key y API secret.'
        )
      if (response.status === 413)
        throw new AppError(
          'VALIDATION',
          `Cloudinary rechazó "${asset.originalName}" por tamaño (plan gratuito).`
        )
      throw new AppError(
        'EXTERNAL_API',
        `Cloudinary devolvió un error ${response.status} al subir "${asset.originalName}".`
      )
    }
    const json = JSON.parse(text) as UploadResponse
    log.info(`Subido ${asset.originalName} → ${json.public_id}`)
    return {
      publicUrl: json.secure_url,
      remove: async () => {
        try {
          const form = new URLSearchParams({ public_id: json.public_id, invalidate: 'true' })
          const res = await fetch(
            `https://api.cloudinary.com/v1_1/${c.cloudName}/${resourceType}/destroy`,
            {
              method: 'POST',
              headers: { Authorization: this.authHeader(c) },
              body: form
            }
          )
          if (!res.ok) log.warn(`No se pudo borrar ${json.public_id} de Cloudinary (${res.status})`)
        } catch (error) {
          log.warn(`No se pudo borrar ${json.public_id} de Cloudinary`, error)
        }
      }
    }
  }
}
