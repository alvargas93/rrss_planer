import type { MediaAsset } from '@shared/domain/media'

export interface HostedMedia {
  publicUrl: string
  /** Borra el archivo del alojamiento temporal. Nunca lanza. */
  remove: () => Promise<void>
}

/**
 * Alojamiento temporal de medios: Instagram (y otras redes) descargan el archivo
 * desde una URL pública. Se sube, se publica y se borra.
 */
export interface MediaHost {
  readonly kind: 'none' | 'cloudinary'
  isConfigured(): boolean
  upload(asset: MediaAsset, filePath: string): Promise<HostedMedia>
}

/** Sin alojamiento: cualquier publicación con medios pasa a modo manual. */
export class NoMediaHost implements MediaHost {
  readonly kind = 'none' as const
  isConfigured(): boolean {
    return false
  }
  upload(): Promise<HostedMedia> {
    return Promise.reject(new Error('No hay alojamiento de medios configurado'))
  }
}
