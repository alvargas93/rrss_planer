import type { Account } from '@shared/domain/accounts'
import type { AnalyticsOverview, RemoteMedia } from '@shared/domain/analytics'
import type { ProfileData } from '@shared/domain/analysis'

/** Formato legible de una publicación de Instagram a partir de sus tipos en la API. */
export function instagramFormat(media: Pick<RemoteMedia, 'mediaType' | 'productType'>): string {
  if (media.productType === 'REELS') return 'reel'
  if (media.productType === 'STORY') return 'historia'
  if (media.mediaType === 'CAROUSEL_ALBUM') return 'carrusel'
  if (media.mediaType === 'VIDEO') return 'vídeo'
  if (media.mediaType === 'IMAGE') return 'foto'
  return 'publicación'
}

function percent(change: number | null): string | null {
  if (change === null) return null
  const value = Math.round(change * 100)
  return `${value >= 0 ? '+' : ''}${value} % frente al periodo anterior`
}

/**
 * Convierte la analítica de la Fase 5 (cuenta propia conectada) en datos de análisis.
 * Pura (probada): la lectura de la API la hace AnalyticsService.
 */
export function instagramProfileData(overview: AnalyticsOverview, account: Account): ProfileData {
  const followersStat = overview.stats.find((s) => s.metric === 'followers_count' && s.available)
  const metaNumber = (key: string): number | null =>
    typeof account.meta[key] === 'number' ? (account.meta[key] as number) : null
  return {
    displayName: account.displayName || null,
    bio: null,
    followers: followersStat?.value ?? metaNumber('followersCount'),
    following: null,
    postsCount: metaNumber('mediaCount'),
    period: `Últimos ${overview.days} días`,
    metrics: overview.stats
      .filter((s) => s.available && s.metric !== 'followers_count')
      .map((s) => ({ label: s.label, value: s.value, note: percent(s.change) })),
    posts: overview.recentMedia.slice(0, 25).map((m) => ({
      format: instagramFormat(m),
      publishedAt: m.publishedAt.slice(0, 10),
      caption: m.caption ? m.caption.slice(0, 300) : null,
      views: m.insights['views'] ?? null,
      likes: m.likeCount,
      comments: m.commentsCount,
      shares: m.insights['shares'] ?? null,
      saves: m.insights['saved'] ?? null,
      url: m.permalink
    })),
    observations:
      overview.unavailable.length > 0
        ? `Datos de la API de Instagram. Métricas no disponibles para esta cuenta: ${overview.unavailable.join(', ')}.`
        : 'Datos de la API de Instagram con la cuenta conectada.'
  }
}
