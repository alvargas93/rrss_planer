import { z } from 'zod'
import { IdSchema } from './common'

/** Métricas de cuenta que la app intenta leer cada día. Nombres de la API de Instagram. */
export const ACCOUNT_METRICS = [
  'followers_count',
  'reach',
  'views',
  'likes',
  'comments',
  'saves',
  'shares',
  'total_interactions',
  'profile_links_taps'
] as const
export type AccountMetric = (typeof ACCOUNT_METRICS)[number]

export const METRIC_LABELS: Record<string, string> = {
  followers_count: 'Seguidores',
  reach: 'Alcance',
  views: 'Visualizaciones',
  likes: 'Me gusta',
  comments: 'Comentarios',
  saves: 'Guardados',
  shares: 'Compartidos',
  total_interactions: 'Interacciones',
  profile_links_taps: 'Toques en enlaces',
  saved: 'Guardados',
  ig_reels_avg_watch_time: 'Tiempo medio de visionado (ms)'
}

export const MetricPointSchema = z.object({
  metric: z.string(),
  /** YYYY-MM-DD en hora local. */
  day: z.string(),
  value: z.number()
})
export type MetricPoint = z.infer<typeof MetricPointSchema>

export const RemoteMediaSchema = z.object({
  id: IdSchema,
  accountId: IdSchema,
  externalId: z.string(),
  mediaType: z.string(),
  productType: z.string(),
  caption: z.string(),
  permalink: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  publishedAt: z.string(),
  likeCount: z.number().int(),
  commentsCount: z.number().int(),
  postId: IdSchema.nullable(),
  /** Últimos valores acumulados de insights (reach, saved, shares, views…). */
  insights: z.record(z.string(), z.number())
})
export type RemoteMedia = z.infer<typeof RemoteMediaSchema>

export const AnalyticsQuerySchema = z.object({
  accountId: IdSchema,
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30)
})
export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>

export const StatSchema = z.object({
  metric: z.string(),
  label: z.string(),
  /** Suma del periodo (o último valor, para seguidores). */
  value: z.number(),
  /** Variación frente al periodo anterior, en tanto por uno; null si no hay base. */
  change: z.number().nullable(),
  available: z.boolean()
})
export type Stat = z.infer<typeof StatSchema>

export const AnalyticsOverviewSchema = z.object({
  accountId: IdSchema,
  days: z.number().int(),
  from: z.string(),
  to: z.string(),
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
  unavailable: z.array(z.string()),
  stats: z.array(StatSchema),
  /** Series diarias por métrica (días sin dato se omiten). */
  series: z.record(z.string(), z.array(MetricPointSchema)),
  topMedia: z.array(RemoteMediaSchema),
  recentMedia: z.array(RemoteMediaSchema)
})
export type AnalyticsOverview = z.infer<typeof AnalyticsOverviewSchema>

export const SyncResultSchema = z.object({
  accountId: IdSchema,
  ok: z.boolean(),
  message: z.string(),
  pointsStored: z.number().int(),
  mediaStored: z.number().int()
})
export type SyncResult = z.infer<typeof SyncResultSchema>

/** Clave de día local YYYY-MM-DD. */
export function dayOf(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Variación relativa entre dos sumas. Pura (probada). */
export function relativeChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return (current - previous) / previous
}
