import { z } from 'zod'
import { EntityBase, IdSchema } from './common'
import { NETWORKS } from '../connectors/networks'

export const TARGET_STATUSES = [
  'pending',
  'queued',
  'publishing',
  'published',
  'failed',
  'manual_notified',
  'cancelled'
] as const
export const TargetStatusSchema = z.enum(TARGET_STATUSES)
export type TargetStatus = z.infer<typeof TargetStatusSchema>

export const TARGET_STATUS_LABELS: Record<TargetStatus, string> = {
  pending: 'Pendiente',
  queued: 'En cola',
  publishing: 'Publicando',
  published: 'Publicada',
  failed: 'Fallida',
  manual_notified: 'Avisada (manual)',
  cancelled: 'Cancelada'
}

export const TargetModeSchema = z.enum(['api', 'manual'])
export type TargetMode = z.infer<typeof TargetModeSchema>

export const PostTargetSchema = z.object({
  ...EntityBase,
  postId: IdSchema,
  variantId: IdSchema,
  accountId: IdSchema.nullable(),
  network: z.enum(NETWORKS),
  mode: TargetModeSchema,
  status: TargetStatusSchema,
  scheduledAt: z.string().nullable(),
  externalPostId: z.string().nullable(),
  externalUrl: z.string().nullable(),
  publishedAt: z.string().nullable(),
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  nextAttemptAt: z.string().nullable()
})
export type PostTarget = z.infer<typeof PostTargetSchema>

/** Asignar (o quitar) una cuenta a la variante de una red dentro de una publicación. */
export const SetTargetSchema = z.object({
  postId: IdSchema,
  network: z.enum(NETWORKS),
  accountId: IdSchema.nullable(),
  mode: TargetModeSchema.default('api')
})

export const PublishNowSchema = z.object({
  postId: IdSchema,
  /** Si se indica, solo ese destino; si no, todos los pendientes del post. */
  targetId: IdSchema.optional()
})

/** Resultado de validar una variante contra las capacidades de la red antes de publicar. */
export const ValidationIssueSchema = z.object({
  level: z.enum(['error', 'warning']),
  message: z.string()
})
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>

export const MAX_ATTEMPTS = 3

/** Espera creciente entre reintentos: 2, 10 y 30 minutos. Pura (probada). */
export function retryDelayMs(attempt: number): number {
  const minutes = [2, 10, 30][Math.min(attempt, 2)] ?? 30
  return minutes * 60_000
}

/** Un destino programado está atrasado si su hora pasó hace más de este margen. */
export const OVERDUE_GRACE_MS = 24 * 60 * 60 * 1000
