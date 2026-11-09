import type { PostData, ProfileData } from '@shared/domain/analysis'
import { AppError } from '@shared/domain/errors'
import { sendJson } from '../net'

/**
 * Datos PÚBLICOS de cualquier canal de YouTube con una clave de API (sin OAuth).
 * Verificado el 2026-11-09: `channels.list` acepta `forHandle` (con o sin @) y cuesta 1 unidad;
 * el cupo por defecto es de 10.000 unidades al día y no tiene coste. Ver docs/connectors/youtube.md §9.
 * Cada lectura gasta 3 unidades: canal, lista de subidas y estadísticas de los vídeos.
 */
const BASE = 'https://www.googleapis.com/youtube/v3'
const LABEL = 'YouTube'
/** Por debajo de esta duración el vídeo puede ser un Short (la API no lo distingue). */
const SHORT_MAX_SECONDS = 180

interface ChannelsResponse {
  items?: Array<{
    id: string
    snippet?: { title?: string; description?: string }
    statistics?: {
      subscriberCount?: string
      hiddenSubscriberCount?: boolean
      videoCount?: string
      viewCount?: string
    }
    contentDetails?: { relatedPlaylists?: { uploads?: string } }
  }>
}

interface PlaylistItemsResponse {
  items?: Array<{ contentDetails?: { videoId?: string } }>
}

interface VideosResponse {
  items?: Array<{
    id: string
    snippet?: { title?: string; publishedAt?: string }
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }
    contentDetails?: { duration?: string }
  }>
}

/** Convierte una duración ISO 8601 (PT1H2M3S) en segundos. Pura (probada). */
export function parseIsoDuration(value: string | undefined): number | null {
  if (!value) return null
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/)
  if (!match) return null
  const [, d = '0', h = '0', m = '0', s = '0'] = match
  return Number(d) * 86_400 + Number(h) * 3600 + Number(m) * 60 + Math.round(Number(s))
}

function count(value: string | undefined): number | null {
  if (value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function url(path: string, params: Record<string, string>, apiKey: string): string {
  const query = new URLSearchParams({ ...params, key: apiKey })
  return `${BASE}/${path}?${query.toString()}`
}

export function videoToPost(video: NonNullable<VideosResponse['items']>[number]): PostData {
  const seconds = parseIsoDuration(video.contentDetails?.duration)
  const format =
    seconds === null
      ? 'vídeo'
      : seconds <= SHORT_MAX_SECONDS
        ? `vídeo corto de ${seconds} s (posible Short)`
        : `vídeo de ${Math.round(seconds / 60)} min`
  return {
    format,
    publishedAt: video.snippet?.publishedAt?.slice(0, 10) ?? null,
    caption: video.snippet?.title ?? null,
    views: count(video.statistics?.viewCount),
    likes: count(video.statistics?.likeCount),
    comments: count(video.statistics?.commentCount),
    shares: null,
    saves: null,
    url: `https://www.youtube.com/watch?v=${video.id}`
  }
}

/** Lee el canal y sus últimos vídeos públicos. Nunca incluye la clave en los errores. */
export async function fetchYoutubePublicProfile(
  apiKey: string,
  username: string,
  maxVideos = 25
): Promise<ProfileData> {
  const handle = username.startsWith('@') ? username : `@${username}`
  const channels = await sendJson<ChannelsResponse>(
    LABEL,
    url('channels', { part: 'snippet,statistics,contentDetails', forHandle: handle }, apiKey)
  )
  const channel = channels.items?.[0]
  if (!channel) {
    throw new AppError(
      'NOT_FOUND',
      `YouTube no encuentra ningún canal con el usuario ${handle}. Revisa cómo está escrito.`
    )
  }

  const uploads = channel.contentDetails?.relatedPlaylists?.uploads
  let posts: PostData[] = []
  if (uploads) {
    const playlist = await sendJson<PlaylistItemsResponse>(
      LABEL,
      url(
        'playlistItems',
        { part: 'contentDetails', playlistId: uploads, maxResults: String(maxVideos) },
        apiKey
      )
    )
    const ids = (playlist.items ?? [])
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => !!id)
    if (ids.length > 0) {
      const videos = await sendJson<VideosResponse>(
        LABEL,
        url('videos', { part: 'snippet,statistics,contentDetails', id: ids.join(',') }, apiKey)
      )
      posts = (videos.items ?? []).map(videoToPost)
    }
  }

  const stats = channel.statistics
  const totalViews = count(stats?.viewCount)
  return {
    displayName: channel.snippet?.title ?? null,
    bio: channel.snippet?.description?.slice(0, 1000) || null,
    followers: stats?.hiddenSubscriberCount ? null : count(stats?.subscriberCount),
    following: null,
    postsCount: count(stats?.videoCount),
    period: 'Totales desde que existe el canal',
    metrics:
      totalViews === null
        ? []
        : [{ label: 'Visualizaciones totales del canal', value: totalViews, note: null }],
    posts,
    observations: [
      'Datos públicos de la API de YouTube: no incluyen alcance, tiempo de visionado ni compartidos.',
      stats?.hiddenSubscriberCount ? 'El canal oculta su número de suscriptores.' : '',
      'La API no distingue los Shorts: los vídeos de 3 minutos o menos se marcan como posibles Shorts.'
    ]
      .filter(Boolean)
      .join(' ')
  }
}
