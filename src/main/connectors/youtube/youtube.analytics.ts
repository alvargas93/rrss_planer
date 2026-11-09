import type { AnalyticsFetch, MetricPoint, RemoteMediaItem } from '@shared/connectors/Connector'
import { sendJson } from '../net'

const YT_API = 'https://www.googleapis.com/youtube/v3'
const REPORTS = 'https://youtubeanalytics.googleapis.com/v2/reports'

/** Métrica de la API de Analytics → nombre interno de la app. */
const METRIC_MAP: Record<string, string> = {
  views: 'views',
  estimatedMinutesWatched: 'minutes_watched',
  likes: 'likes',
  comments: 'comments',
  shares: 'shares',
  subscribersGained: 'subscribers_gained',
  subscribersLost: 'subscribers_lost'
}

interface ReportResponse {
  columnHeaders?: Array<{ name: string }>
  rows?: Array<Array<string | number>>
}

interface VideoItem {
  id: string
  snippet?: { title?: string; publishedAt?: string; thumbnails?: Record<string, { url: string }> }
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }
}

const auth = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` })
const query = (params: Record<string, string>): string => new URLSearchParams(params).toString()

/** Convierte la respuesta de reports.query (dimensión `day` + métricas) en puntos diarios. */
export function pointsFromReport(report: ReportResponse): MetricPoint[] {
  const headers = (report.columnHeaders ?? []).map((h) => h.name)
  const points: MetricPoint[] = []
  for (const row of report.rows ?? []) {
    const day = String(row[0])
    headers.forEach((name, index) => {
      const metric = METRIC_MAP[name]
      if (index === 0 || !metric) return
      points.push({ metric, day, value: Number(row[index]) || 0 })
    })
  }
  return points
}

/**
 * Métricas de YouTube con la Analytics API (docs/connectors/youtube.md §2).
 * Los vídeos recientes salen de la lista de subidas del canal (1 unidad de cuota por llamada).
 */
export class YoutubeAnalytics implements AnalyticsFetch {
  /** Estadísticas de los vídeos leídos en `recentMedia`, para no repetir la consulta. */
  private stats = new Map<string, Record<string, number>>()

  async accountDaily(input: {
    accessToken: string
    fromDay: string
    toDay: string
  }): Promise<{ points: MetricPoint[]; unavailable: string[] }> {
    const report = await sendJson<ReportResponse>(
      'YouTube',
      `${REPORTS}?${query({
        ids: 'channel==MINE',
        startDate: input.fromDay,
        endDate: input.toDay,
        metrics: Object.keys(METRIC_MAP).join(','),
        dimensions: 'day',
        sort: 'day'
      })}`,
      { headers: auth(input.accessToken) }
    )
    return { points: pointsFromReport(report), unavailable: [] }
  }

  async recentMedia(input: { accessToken: string; limit: number }): Promise<RemoteMediaItem[]> {
    const headers = auth(input.accessToken)
    const channel = await sendJson<{
      items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>
    }>('YouTube', `${YT_API}/channels?${query({ part: 'contentDetails', mine: 'true' })}`, {
      headers
    })
    const uploads = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
    if (!uploads) return []
    const list = await sendJson<{ items?: Array<{ contentDetails?: { videoId?: string } }> }>(
      'YouTube',
      `${YT_API}/playlistItems?${query({ part: 'contentDetails', playlistId: uploads, maxResults: String(Math.min(input.limit, 50)) })}`,
      { headers }
    )
    const ids = (list.items ?? [])
      .map((i) => i.contentDetails?.videoId)
      .filter((id): id is string => !!id)
    if (ids.length === 0) return []
    const videos = await sendJson<{ items?: VideoItem[] }>(
      'YouTube',
      `${YT_API}/videos?${query({ part: 'snippet,statistics', id: ids.join(',') })}`,
      { headers }
    )
    this.stats.clear()
    return (videos.items ?? []).map((v) => {
      const views = Number(v.statistics?.viewCount) || 0
      const likes = Number(v.statistics?.likeCount) || 0
      const comments = Number(v.statistics?.commentCount) || 0
      this.stats.set(v.id, { views, likes, comments })
      return {
        externalId: v.id,
        mediaType: 'VIDEO',
        productType: 'VIDEO',
        caption: v.snippet?.title ?? '',
        permalink: `https://www.youtube.com/watch?v=${v.id}`,
        thumbnailUrl:
          v.snippet?.thumbnails?.['medium']?.url ?? v.snippet?.thumbnails?.['default']?.url ?? null,
        publishedAt: v.snippet?.publishedAt ?? new Date().toISOString(),
        likeCount: likes,
        commentsCount: comments
      }
    })
  }

  async mediaInsights(input: { item: RemoteMediaItem }): Promise<Record<string, number>> {
    return this.stats.get(input.item.externalId) ?? {}
  }
}
