import type { AnalyticsFetch, MetricPoint, RemoteMediaItem } from '@shared/connectors/Connector'
import { dayOf } from '@shared/domain/analytics'
import { AppError } from '@shared/domain/errors'
import { requestJson } from '../http'
import { IG_GRAPH } from './instagram.api'
import { createLogger } from '../../log'

const log = createLogger('ig-analytics')

/**
 * Lectura de insights con Instagram Login (docs/connectors/instagram.md §5).
 * - `reach` admite serie temporal diaria; el resto solo total por rango, así que
 *   se pide día a día (una llamada por día con todas las métricas juntas).
 * - Las métricas que la cuenta no puede leer (p. ej. menos de 100 seguidores) se
 *   detectan y se devuelven en `unavailable` para no insistir.
 */
const TIME_SERIES_METRICS = ['reach'] as const
const TOTAL_VALUE_METRICS = [
  'views',
  'likes',
  'comments',
  'saves',
  'shares',
  'total_interactions',
  'profile_links_taps'
] as const
const MEDIA_METRICS = [
  'reach',
  'saved',
  'shares',
  'likes',
  'comments',
  'total_interactions',
  'views'
] as const
const REEL_EXTRA_METRICS = ['ig_reels_avg_watch_time'] as const

interface InsightEntry {
  name: string
  period?: string
  values?: Array<{ value: number; end_time?: string }>
  total_value?: { value: number }
}

interface MediaEntry {
  id: string
  caption?: string
  media_type?: string
  media_product_type?: string
  timestamp: string
  permalink?: string
  like_count?: number
  comments_count?: number
  thumbnail_url?: string
  media_url?: string
}

const unix = (date: Date): number => Math.floor(date.getTime() / 1000)
const localDayStart = (day: string): Date => new Date(`${day}T00:00:00`)
const addDays = (day: string, n: number): string => {
  const d = localDayStart(day)
  d.setDate(d.getDate() + n)
  return dayOf(d)
}

/** Si el error menciona una métrica concreta, la devuelve para excluirla. */
function metricFromError(error: unknown, candidates: readonly string[]): string | null {
  const message =
    error instanceof AppError
      ? String(
          (error.details as { graph?: { message?: string } } | undefined)?.graph?.message ??
            error.message
        )
      : String(error)
  return candidates.find((m) => new RegExp(`\\b${m}\\b`).test(message)) ?? null
}

export class InstagramAnalytics implements AnalyticsFetch {
  async accountDaily(input: {
    accessToken: string
    account: { externalId: string }
    fromDay: string
    toDay: string
  }): Promise<{ points: MetricPoint[]; unavailable: string[] }> {
    const igId = input.account.externalId
    const points: MetricPoint[] = []
    const unavailable = new Set<string>()
    const auth = { access_token: input.accessToken }

    // 1) Serie temporal (una llamada para todo el rango).
    for (const metric of TIME_SERIES_METRICS) {
      try {
        const result = await requestJson<{ data: InsightEntry[] }>(`${IG_GRAPH}/${igId}/insights`, {
          params: {
            ...auth,
            metric,
            period: 'day',
            metric_type: 'time_series',
            since: unix(localDayStart(input.fromDay)),
            until: unix(localDayStart(addDays(input.toDay, 1)))
          }
        })
        for (const entry of result.data ?? []) {
          for (const v of entry.values ?? []) {
            if (!v.end_time) continue
            // end_time es el final del día (UTC); el valor pertenece al día anterior en hora local.
            const day = dayOf(new Date(new Date(v.end_time).getTime() - 1000))
            points.push({ metric: entry.name, day, value: Number(v.value) || 0 })
          }
        }
      } catch (error) {
        log.warn(`Serie ${metric} no disponible: ${AppError.from(error).message}`)
        unavailable.add(metric)
      }
    }

    // 2) Totales por día para el resto de métricas.
    let metrics: string[] = [...TOTAL_VALUE_METRICS]
    for (let day = input.fromDay; day <= input.toDay && metrics.length > 0; day = addDays(day, 1)) {
      const since = unix(localDayStart(day))
      const until = unix(localDayStart(addDays(day, 1)))
      let attempts = 0
      while (metrics.length > 0 && attempts < 4) {
        attempts++
        try {
          const result = await requestJson<{ data: InsightEntry[] }>(
            `${IG_GRAPH}/${igId}/insights`,
            {
              params: {
                ...auth,
                metric: metrics.join(','),
                period: 'day',
                metric_type: 'total_value',
                since,
                until
              }
            }
          )
          for (const entry of result.data ?? []) {
            const value = entry.total_value?.value ?? entry.values?.[0]?.value
            if (value !== undefined)
              points.push({ metric: entry.name, day, value: Number(value) || 0 })
          }
          break
        } catch (error) {
          const bad = metricFromError(error, metrics)
          if (!bad) throw error
          log.warn(`Métrica ${bad} no disponible para esta cuenta`)
          unavailable.add(bad)
          metrics = metrics.filter((m) => m !== bad)
        }
      }
    }

    return { points, unavailable: [...unavailable] }
  }

  async recentMedia(input: {
    accessToken: string
    account: { externalId: string }
    limit: number
  }): Promise<RemoteMediaItem[]> {
    const result = await requestJson<{ data: MediaEntry[] }>(
      `${IG_GRAPH}/${input.account.externalId}/media`,
      {
        params: {
          access_token: input.accessToken,
          fields:
            'id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count,thumbnail_url,media_url',
          limit: input.limit
        }
      }
    )
    return (result.data ?? []).map((m) => ({
      externalId: m.id,
      mediaType: m.media_type ?? '',
      productType: m.media_product_type ?? '',
      caption: m.caption ?? '',
      permalink: m.permalink ?? null,
      thumbnailUrl:
        m.thumbnail_url ??
        (m.media_type === 'IMAGE' || m.media_type === 'CAROUSEL_ALBUM'
          ? (m.media_url ?? null)
          : null),
      publishedAt: m.timestamp,
      likeCount: m.like_count ?? 0,
      commentsCount: m.comments_count ?? 0
    }))
  }

  async mediaInsights(input: {
    accessToken: string
    item: RemoteMediaItem
  }): Promise<Record<string, number>> {
    const { item } = input
    // Los carruseles y las historias no devuelven insights (o caducan): se omiten.
    if (item.mediaType === 'CAROUSEL_ALBUM' || item.productType === 'STORY') return {}
    let metrics: string[] = [
      ...MEDIA_METRICS,
      ...(item.productType === 'REELS' ? REEL_EXTRA_METRICS : [])
    ]
    const out: Record<string, number> = {}
    let attempts = 0
    while (metrics.length > 0 && attempts < 4) {
      attempts++
      try {
        const result = await requestJson<{ data: InsightEntry[] }>(
          `${IG_GRAPH}/${item.externalId}/insights`,
          {
            params: { access_token: input.accessToken, metric: metrics.join(',') }
          }
        )
        for (const entry of result.data ?? []) {
          const value = entry.values?.[0]?.value ?? entry.total_value?.value
          if (value !== undefined) out[entry.name] = Number(value) || 0
        }
        return out
      } catch (error) {
        const bad = metricFromError(error, metrics)
        if (!bad) throw error
        metrics = metrics.filter((m) => m !== bad)
      }
    }
    return out
  }
}
