import { z } from 'zod'
import { NETWORKS, POST_KINDS, type Network } from './networks'
import type { Account } from '../domain/accounts'
import type { MediaAsset } from '../domain/media'
import type { PostVariant } from '../domain/posts'
import type { ValidationIssue } from '../domain/publishing'

/**
 * Lo que una red permite, verificado contra su documentación oficial.
 * El compositor y el publicador lo usan para avisar antes y validar después.
 */
export const MediaRuleSchema = z.object({
  kinds: z.array(z.enum(['image', 'video'])),
  imageMimes: z.array(z.string()),
  videoMimes: z.array(z.string()),
  maxImageBytes: z.number(),
  maxVideoBytes: z.number(),
  minVideoSeconds: z.number().nullable(),
  maxVideoSeconds: z.number().nullable(),
  /** Rango de proporción ancho/alto permitido para imágenes. */
  minAspect: z.number(),
  maxAspect: z.number(),
  minCount: z.number().int(),
  maxCount: z.number().int()
})
export type MediaRule = z.infer<typeof MediaRuleSchema>

export const CapabilitiesSchema = z.object({
  network: z.enum(NETWORKS),
  /** Formatos que se pueden publicar por API y sus reglas de medios. */
  kinds: z.partialRecord(z.enum(POST_KINDS), MediaRuleSchema),
  maxChars: z.number().int(),
  maxHashtags: z.number().int().nullable(),
  altTextMaxChars: z.number().int().nullable(),
  /** Si la red programa por sí misma (YouTube sí; Instagram no). */
  nativeScheduling: z.boolean(),
  /** Si las publicaciones por API necesitan una URL pública para los medios. */
  requiresPublicMediaUrl: z.boolean(),
  metrics: z.boolean(),
  /** Si el acceso se renueva solo (false: hay que volver a autorizar, como LinkedIn). */
  autoRefresh: z.boolean(),
  /** Texto corto para la interfaz: qué no se puede hacer por API. */
  notes: z.array(z.string())
})
export type Capabilities = z.infer<typeof CapabilitiesSchema>

export interface PublishInput {
  account: Account
  accessToken: string
  variant: PostVariant
  /** Medios ya alojados en URLs públicas, en orden. */
  media: Array<{
    asset: MediaAsset
    /** URL pública (solo si la red la exige); cadena vacía si no. */
    publicUrl: string
    /** Ruta del archivo en el equipo, para las redes que reciben los bytes. */
    filePath: string
  }>
  /** Para registrar progreso ("subiendo", "procesando…"). */
  onProgress?: (message: string) => void
  /**
   * Hora futura (ISO) a la que la propia red debe publicar. Solo la usan las redes con
   * `nativeScheduling`; el resto la ignora y publica en el momento.
   */
  publishAt?: string | null
}

export interface PublishResult {
  externalPostId: string
  externalUrl: string | null
  /** Aviso para el usuario aunque se haya publicado (p. ej. YouTube lo dejó en privado). */
  notice?: string | null
}

export interface ConnectedIdentity {
  externalId: string
  username: string
  displayName: string
  avatarUrl: string | null
  accountType: string
  scopes: string[]
  tokenExpiresAt: string | null
  meta: Record<string, unknown>
}

export interface MetricPoint {
  metric: string
  /** YYYY-MM-DD en hora local. */
  day: string
  value: number
}

export interface RemoteMediaItem {
  externalId: string
  mediaType: string
  productType: string
  caption: string
  permalink: string | null
  thumbnailUrl: string | null
  publishedAt: string
  likeCount: number
  commentsCount: number
}

export interface AnalyticsFetch {
  /** Métricas diarias de la cuenta entre dos días (inclusive). */
  accountDaily(input: {
    accessToken: string
    account: Account
    fromDay: string
    toDay: string
  }): Promise<{ points: MetricPoint[]; unavailable: string[] }>
  /** Publicaciones recientes de la cuenta con sus contadores básicos. */
  recentMedia(input: {
    accessToken: string
    account: Account
    limit: number
  }): Promise<RemoteMediaItem[]>
  /** Insights acumulados de una publicación. */
  mediaInsights(input: {
    accessToken: string
    account: Account
    item: RemoteMediaItem
  }): Promise<Record<string, number>>
}

/**
 * Interfaz común de conector. Cada red la implementa en src/main/connectors/<red>/.
 * El resto de la app solo conoce esta forma.
 */
export interface Connector {
  readonly network: Network
  capabilities(): Capabilities
  /** Comprueba un token y devuelve la identidad de la cuenta. */
  identify(accessToken: string): Promise<ConnectedIdentity>
  /**
   * Devuelve un token nuevo y su caducidad, si la red lo permite. Si la red entrega un
   * refresh token nuevo se devuelve también; `null` o ausente significa conservar el actual.
   */
  refreshToken(
    accessToken: string,
    refreshToken?: string | null
  ): Promise<{ accessToken: string; expiresAt: string | null; refreshToken?: string | null }>
  /** Valida sin red: longitud, formatos, tamaños. */
  validate(variant: PostVariant, media: MediaAsset[]): ValidationIssue[]
  publish(input: PublishInput): Promise<PublishResult>
  /** Lectura de métricas; ausente si la red no las ofrece por API. */
  analytics?: AnalyticsFetch
}
