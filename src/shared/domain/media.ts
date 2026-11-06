import { z } from 'zod'
import { EntityBase, IdSchema } from './common'

export const MediaKindSchema = z.enum(['image', 'video'])
export type MediaKind = z.infer<typeof MediaKindSchema>

export const MediaAssetSchema = z.object({
  ...EntityBase,
  fileName: z.string(),
  originalName: z.string(),
  kind: MediaKindSchema,
  mime: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  sizeBytes: z.number().int(),
  sha256: z.string(),
  altText: z.string(),
  derivedFrom: IdSchema.nullable(),
  /** URL que la interfaz puede usar directamente en <img> o <video>. */
  url: z.string()
})
export type MediaAsset = z.infer<typeof MediaAssetSchema>

export const MediaUpdateSchema = z.object({
  id: IdSchema,
  patch: z.object({ altText: z.string().max(1000).optional() })
})

/** Extensiones aceptadas al importar. */
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'm4v'] as const

export const MIME_BY_EXTENSION: Record<string, { mime: string; kind: MediaKind }> = {
  jpg: { mime: 'image/jpeg', kind: 'image' },
  jpeg: { mime: 'image/jpeg', kind: 'image' },
  png: { mime: 'image/png', kind: 'image' },
  webp: { mime: 'image/webp', kind: 'image' },
  gif: { mime: 'image/gif', kind: 'image' },
  mp4: { mime: 'video/mp4', kind: 'video' },
  m4v: { mime: 'video/mp4', kind: 'video' },
  mov: { mime: 'video/quicktime', kind: 'video' },
  webm: { mime: 'video/webm', kind: 'video' }
}

/** Esquema del protocolo interno con el que la interfaz carga los medios. */
export const MEDIA_PROTOCOL = 'media'

export function mediaUrl(fileName: string): string {
  return `${MEDIA_PROTOCOL}://local/${encodeURIComponent(fileName)}`
}
