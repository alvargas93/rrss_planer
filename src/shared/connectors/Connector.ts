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
  /** Texto corto para la interfaz: qué no se puede hacer por API. */
  notes: z.array(z.string())
})
export type Capabilities = z.infer<typeof CapabilitiesSchema>

export interface PublishInput {
  account: Account
  accessToken: string
  variant: PostVariant
  /** Medios ya alojados en URLs públicas, en orden. */
  media: Array<{ asset: MediaAsset; publicUrl: string }>
  /** Para registrar progreso ("subiendo", "procesando…"). */
  onProgress?: (message: string) => void
}

export interface PublishResult {
  externalPostId: string
  externalUrl: string | null
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

/**
 * Interfaz común de conector. Cada red la implementa en src/main/connectors/<red>/.
 * El resto de la app solo conoce esta forma.
 */
export interface Connector {
  readonly network: Network
  capabilities(): Capabilities
  /** Comprueba un token y devuelve la identidad de la cuenta. */
  identify(accessToken: string): Promise<ConnectedIdentity>
  /** Devuelve un token nuevo y su caducidad, si la red lo permite. */
  refreshToken(accessToken: string): Promise<{ accessToken: string; expiresAt: string | null }>
  /** Valida sin red: longitud, formatos, tamaños. */
  validate(variant: PostVariant, media: MediaAsset[]): ValidationIssue[]
  publish(input: PublishInput): Promise<PublishResult>
}
