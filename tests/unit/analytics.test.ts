import { describe, expect, it, vi } from 'vitest'
import { dayOf, relativeChange, type MetricPoint, type RemoteMedia } from '@shared/domain/analytics'
import type { Account } from '@shared/domain/accounts'
import type { Connector, RemoteMediaItem } from '@shared/connectors/Connector'
import { AnalyticsService } from '@main/services/analytics.service'
import type { AnalyticsRepository, SyncInfo } from '@main/repositories/analytics.repository'
import type { AccountsService } from '@main/services/accounts.service'
import { ConnectorRegistry } from '@main/connectors/registry'
import { INSTAGRAM_CAPABILITIES } from '@main/connectors/instagram/instagram.connector'

describe('funciones puras de analítica', () => {
  it('variación relativa con y sin base', () => {
    expect(relativeChange(120, 100)).toBeCloseTo(0.2)
    expect(relativeChange(50, 100)).toBeCloseTo(-0.5)
    expect(relativeChange(10, 0)).toBeNull()
    expect(relativeChange(0, 0)).toBe(0)
  })
  it('clave de día local', () => {
    expect(dayOf(new Date(2026, 10, 6, 23, 59))).toBe('2026-11-06')
    expect(dayOf(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01')
  })
})

class FakeAnalyticsRepo {
  points = new Map<string, MetricPoint & { scope: string; mediaId: string }>()
  media: RemoteMediaItem[] = []
  sync: SyncInfo = { lastSyncAt: null, lastError: null, unavailable: [] }
  upsertPoints(
    _a: string,
    scope: 'account' | 'media',
    mediaId: string,
    points: MetricPoint[]
  ): number {
    for (const p of points)
      this.points.set(`${scope}|${mediaId}|${p.metric}|${p.day}`, { ...p, scope, mediaId })
    return points.length
  }
  accountSeries(_a: string, from: string, to: string): MetricPoint[] {
    return [...this.points.values()]
      .filter((p) => p.scope === 'account' && p.day >= from && p.day <= to)
      .sort((a, b) => a.day.localeCompare(b.day))
      .map(({ metric, day, value }) => ({ metric, day, value }))
  }
  latestMediaInsights(): Map<string, Record<string, number>> {
    const map = new Map<string, Record<string, number>>()
    for (const p of this.points.values()) {
      if (p.scope !== 'media') continue
      map.set(p.mediaId, { ...(map.get(p.mediaId) ?? {}), [p.metric]: p.value })
    }
    return map
  }
  firstDay(): string | null {
    const days = [...this.points.values()]
      .filter((p) => p.scope === 'account')
      .map((p) => p.day)
      .sort()
    return days[0] ?? null
  }
  upsertRemoteMedia(_a: string, items: RemoteMediaItem[]): number {
    this.media = items
    return items.length
  }
  listRemoteMedia(accountId: string): RemoteMedia[] {
    const insights = this.latestMediaInsights()
    return this.media.map((m, i) => ({
      id: `rm${i}`,
      accountId,
      postId: null,
      insights: insights.get(m.externalId) ?? {},
      ...m
    }))
  }
  syncInfo(): SyncInfo {
    return this.sync
  }
  recordSync(_a: string, info: { lastError: string | null; unavailable: string[] }): void {
    this.sync = { lastSyncAt: 'now', ...info }
  }
}

const account: Account = {
  id: 'a1',
  network: 'instagram',
  externalId: '178',
  username: 'mi_cuenta',
  displayName: 'Mi cuenta',
  avatarUrl: null,
  accountType: 'business',
  status: 'connected',
  scopes: [],
  tokenExpiresAt: null,
  tokenRefreshedAt: null,
  lastError: null,
  meta: {},
  createdAt: 'now',
  updatedAt: 'now'
}

const now = new Date(2026, 10, 6, 12, 0, 0) // 6 nov 2026 local
const day = (offset: number): string => dayOf(new Date(now.getTime() + offset * 86_400_000))

function fakeConnector(): Connector {
  return {
    network: 'instagram',
    capabilities: () => INSTAGRAM_CAPABILITIES,
    identify: vi.fn(async () => ({
      externalId: '178',
      username: 'mi_cuenta',
      displayName: 'Mi cuenta',
      avatarUrl: null,
      accountType: 'business',
      scopes: [],
      tokenExpiresAt: null,
      meta: { followersCount: 1234 }
    })),
    refreshToken: vi.fn(),
    validate: () => [],
    publish: vi.fn(),
    analytics: {
      accountDaily: vi.fn(async ({ fromDay, toDay }) => {
        const points: MetricPoint[] = []
        for (
          let d = fromDay;
          d <= toDay;
          d = dayOf(new Date(new Date(`${d}T12:00:00`).getTime() + 86_400_000))
        ) {
          points.push(
            { metric: 'reach', day: d, value: 100 },
            { metric: 'total_interactions', day: d, value: 10 }
          )
        }
        return { points, unavailable: ['profile_links_taps'] }
      }),
      recentMedia: vi.fn(async () => [
        {
          externalId: 'm1',
          mediaType: 'IMAGE',
          productType: 'FEED',
          caption: 'Primera',
          permalink: 'https://instagram.com/p/1',
          thumbnailUrl: null,
          publishedAt: `${day(-3)}T10:00:00+0000`,
          likeCount: 50,
          commentsCount: 5
        },
        {
          externalId: 'm2',
          mediaType: 'VIDEO',
          productType: 'REELS',
          caption: 'Reel',
          permalink: null,
          thumbnailUrl: null,
          publishedAt: `${day(-1)}T10:00:00+0000`,
          likeCount: 200,
          commentsCount: 20
        }
      ]),
      mediaInsights: vi.fn(async ({ item }) =>
        item.externalId === 'm2' ? { reach: 5000, saved: 40 } : { reach: 800, saved: 3 }
      )
    }
  }
}

function setup(): { service: AnalyticsService; repo: FakeAnalyticsRepo; connector: Connector } {
  const repo = new FakeAnalyticsRepo()
  const connector = fakeConnector()
  const accounts = {
    get: () => account,
    list: () => [account],
    tokenFor: () => 'token',
    markError: vi.fn()
  } as unknown as AccountsService
  const service = new AnalyticsService(
    repo as unknown as AnalyticsRepository,
    accounts,
    new ConnectorRegistry([connector]),
    { listPublishedByAccount: () => [] }
  )
  return { service, repo, connector }
}

describe('AnalyticsService', () => {
  it('la primera sincronización trae 14 días y guarda seguidores, medios e insights', async () => {
    const { service, repo, connector } = setup()
    const result = await service.sync('a1', now)
    expect(result.ok).toBe(true)
    const call = (connector.analytics!.accountDaily as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as { fromDay: string; toDay: string }
    expect(call.fromDay).toBe(day(-14))
    expect(call.toDay).toBe(day(-1))
    expect(repo.points.get(`account||followers_count|${day(0)}`)?.value).toBe(1234)
    expect(repo.media).toHaveLength(2)
    expect(repo.sync.unavailable).toEqual(['profile_links_taps'])
    expect(repo.latestMediaInsights().get('m2')?.['reach']).toBe(5000)
  })

  it('las siguientes sincronizaciones solo piden los dos últimos días', async () => {
    const { service, connector } = setup()
    await service.sync('a1', now)
    await service.sync('a1', now)
    const second = (connector.analytics!.accountDaily as ReturnType<typeof vi.fn>).mock
      .calls[1]?.[0] as { fromDay: string }
    expect(second.fromDay).toBe(day(-2))
  })

  it('el resumen calcula totales, variación y las mejores publicaciones', async () => {
    const { service } = setup()
    await service.sync('a1', now)
    const o = service.overview({ accountId: 'a1', days: 7 }, now)
    const reach = o.stats.find((s) => s.metric === 'reach')!
    expect(reach.available).toBe(true)
    expect(reach.value).toBe(700) // 7 días × 100
    expect(reach.change).toBeCloseTo(0) // el periodo anterior también tiene 100/día
    expect(o.stats.find((s) => s.metric === 'profile_links_taps')?.available).toBe(false)
    expect(o.stats.find((s) => s.metric === 'followers_count')?.value).toBe(1234)
    expect(o.topMedia[0]?.externalId).toBe('m2')
    expect(o.series['reach']).toHaveLength(7)
  })

  it('el texto para Claude incluye cifras y publicaciones', async () => {
    const { service } = setup()
    await service.sync('a1', now)
    const text = service.digest({ accountId: 'a1', days: 7 }, now)
    expect(text).toContain('@mi_cuenta')
    expect(text).toContain('Alcance: 700')
    expect(text).toContain('Reel')
    expect(text).toContain('profile_links_taps')
    expect(text.length).toBeLessThanOrEqual(7500)
  })

  it('un fallo de la API queda registrado sin romper la sincronización', async () => {
    const { service, repo, connector } = setup()
    ;(connector.analytics!.recentMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Instagram caído')
    )
    const result = await service.sync('a1', now)
    expect(result.ok).toBe(false)
    expect(repo.sync.lastError).toContain('Instagram caído')
  })
})
