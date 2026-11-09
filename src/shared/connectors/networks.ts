/**
 * Redes soportadas y lo que el compositor necesita saber de cada una para
 * mostrar vistas previas y contadores.
 *
 * IMPORTANTE: estos límites son ORIENTATIVOS para la Fase 2 (organización sin
 * redes conectadas). Cada conector los sustituirá por sus `Capabilities`
 * verificadas contra la documentación oficial en su fase (4 y 7).
 */
export const NETWORKS = ['instagram', 'linkedin', 'x', 'youtube', 'tiktok'] as const
export type Network = (typeof NETWORKS)[number]

export const POST_KINDS = [
  'feed',
  'carousel',
  'reel',
  'story',
  'short',
  'video',
  'article',
  'thread'
] as const
export type PostKind = (typeof POST_KINDS)[number]

export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9' | '1.91:1'

export interface KindMeta {
  label: string
  aspect: AspectRatio
  /** Si el formato exige medios (imagen/vídeo) para publicarse. */
  requiresMedia: boolean
  mediaKinds: Array<'image' | 'video'>
  /** Máximo de archivos (carrusel). */
  maxMedia: number
}

export interface NetworkMeta {
  label: string
  kinds: PostKind[]
  defaultKind: PostKind
  /** Caracteres del texto principal (pie, descripción o cuerpo). */
  maxChars: number
  /** Aviso cuando el texto supera esta longitud: la red lo recorta con "... más". */
  foldAfter: number | null
  maxHashtags: number | null
  /** Campos adicionales que pide la red. */
  extraFields: Array<{ key: string; label: string; maxChars: number; required: boolean }>
  /** Nombre del formato en esta red cuando no coincide con el general (TikTok llama «vídeo» al formato vertical). */
  kindLabels?: Partial<Record<PostKind, string>>
}

export const KIND_META: Record<PostKind, KindMeta> = {
  feed: {
    label: 'Publicación',
    aspect: '4:5',
    requiresMedia: true,
    mediaKinds: ['image', 'video'],
    maxMedia: 1
  },
  carousel: {
    label: 'Carrusel',
    aspect: '4:5',
    requiresMedia: true,
    mediaKinds: ['image', 'video'],
    maxMedia: 10
  },
  reel: { label: 'Reel', aspect: '9:16', requiresMedia: true, mediaKinds: ['video'], maxMedia: 1 },
  story: {
    label: 'Historia',
    aspect: '9:16',
    requiresMedia: true,
    mediaKinds: ['image', 'video'],
    maxMedia: 1
  },
  short: {
    label: 'Short',
    aspect: '9:16',
    requiresMedia: true,
    mediaKinds: ['video'],
    maxMedia: 1
  },
  video: {
    label: 'Vídeo',
    aspect: '16:9',
    requiresMedia: true,
    mediaKinds: ['video'],
    maxMedia: 1
  },
  article: {
    label: 'Texto',
    aspect: '1.91:1',
    requiresMedia: false,
    mediaKinds: ['image', 'video'],
    maxMedia: 9
  },
  thread: {
    label: 'Texto / hilo',
    aspect: '16:9',
    requiresMedia: false,
    mediaKinds: ['image', 'video'],
    maxMedia: 4
  }
}

export const NETWORK_META: Record<Network, NetworkMeta> = {
  instagram: {
    label: 'Instagram',
    kinds: ['feed', 'carousel', 'reel', 'story'],
    defaultKind: 'feed',
    maxChars: 2200,
    foldAfter: 125,
    maxHashtags: 30,
    extraFields: []
  },
  linkedin: {
    label: 'LinkedIn',
    kinds: ['article'],
    defaultKind: 'article',
    maxChars: 3000,
    foldAfter: 210,
    maxHashtags: null,
    extraFields: []
  },
  x: {
    label: 'X',
    kinds: ['thread'],
    defaultKind: 'thread',
    maxChars: 280,
    foldAfter: null,
    maxHashtags: null,
    extraFields: []
  },
  youtube: {
    label: 'YouTube',
    kinds: ['video', 'short'],
    defaultKind: 'video',
    maxChars: 5000,
    foldAfter: null,
    maxHashtags: null,
    extraFields: [{ key: 'title', label: 'Título del vídeo', maxChars: 100, required: true }]
  },
  // Fase 9: solo análisis y publicación manual (ADR 0002). Límite de texto orientativo.
  tiktok: {
    label: 'TikTok',
    kinds: ['short', 'carousel', 'story'],
    defaultKind: 'short',
    maxChars: 2200,
    foldAfter: null,
    maxHashtags: null,
    extraFields: [],
    kindLabels: { short: 'Vídeo', carousel: 'Carrusel de fotos' }
  }
}

/** Nombre del formato tal como lo llama cada red. */
export function kindLabel(network: Network, kind: PostKind): string {
  return NETWORK_META[network].kindLabels?.[kind] ?? KIND_META[kind].label
}

/** Separa el texto en hashtags y cuerpo, para contarlos y previsualizarlos. */
export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) ?? []
  return Array.from(new Set(matches.map((tag) => tag.toLowerCase())))
}

/** Convierte una relación de aspecto en un número ancho/alto. */
export function aspectToRatio(aspect: AspectRatio): number {
  const [w, h] = aspect.split(':').map(Number)
  return (w ?? 1) / (h ?? 1)
}
