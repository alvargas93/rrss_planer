import {
  accountMetricsFor,
  METRIC_LABELS,
  dayOf,
  relativeChange,
  type AnalyticsOverview,
  type AnalyticsQuery,
  type MetricPoint,
  type RemoteMedia,
  type Stat,
  type SyncResult
} from '@shared/domain/analytics'
import { AppError } from '@shared/domain/errors'
import type { AnalyticsRepository } from '../repositories/analytics.repository'
import type { TargetsRepository } from '../repositories/targets.repository'
import type { AccountsService } from './accounts.service'
import type { ConnectorRegistry } from '../connectors/registry'
import { createLogger } from '../log'

const log = createLogger('analytics')
const DAY_MS = 86_400_000
/** Días que se traen la primera vez; después solo los dos últimos (los datos pueden retrasarse 48 h). */
const BACKFILL_DAYS = 14
const INCREMENTAL_DAYS = 2
const MEDIA_LIMIT = 25

export class AnalyticsService {
  constructor(
    private readonly repo: AnalyticsRepository,
    private readonly accounts: AccountsService,
    private readonly connectors: ConnectorRegistry,
    private readonly targets: Pick<TargetsRepository, 'listPublishedByAccount'>
  ) {}

  /** Sincroniza una cuenta: métricas diarias, publicaciones recientes y sus insights. */
  async sync(accountId: string, now = new Date()): Promise<SyncResult> {
    const account = this.accounts.get(accountId)
    const connector = this.connectors.get(account.network)
    if (!connector.analytics) {
      return {
        accountId,
        ok: false,
        message: 'Esta red no ofrece métricas por API.',
        pointsStored: 0,
        mediaStored: 0
      }
    }
    let accessToken: string
    try {
      accessToken = await this.accounts.freshToken(accountId)
    } catch (error) {
      const appError = AppError.from(error)
      if (appError.code === 'UNAUTHORIZED') this.accounts.markError(accountId, appError.message)
      return { accountId, ok: false, message: appError.message, pointsStored: 0, mediaStored: 0 }
    }
    const previous = this.repo.syncInfo(accountId)
    let pointsStored = 0
    let mediaStored = 0
    try {
      // Se mira ANTES de guardar nada: decide si es la primera carga (14 días) o incremental.
      const first = this.repo.firstDay(accountId)
      // Seguidores: valor de hoy desde la identidad.
      const identity = await connector.identify(accessToken)
      const followers = identity.meta['followersCount']
      if (typeof followers === 'number') {
        pointsStored += this.repo.upsertPoints(accountId, 'account', '', [
          { metric: 'followers_count', day: dayOf(now), value: followers }
        ])
      }

      // Métricas diarias.
      const span = first ? INCREMENTAL_DAYS : BACKFILL_DAYS
      const toDay = dayOf(new Date(now.getTime() - DAY_MS)) // ayer: hoy aún no está cerrado
      const fromDay = dayOf(new Date(now.getTime() - span * DAY_MS))
      const daily = await connector.analytics.accountDaily({ accessToken, account, fromDay, toDay })
      pointsStored += this.repo.upsertPoints(accountId, 'account', '', daily.points)

      // Publicaciones recientes + insights.
      const items = await connector.analytics.recentMedia({
        accessToken,
        account,
        limit: MEDIA_LIMIT
      })
      const published = this.targets.listPublishedByAccount(accountId)
      const postIdByExternal = new Map(
        published.filter((t) => t.externalPostId).map((t) => [t.externalPostId!, t.postId])
      )
      mediaStored = this.repo.upsertRemoteMedia(accountId, items, postIdByExternal)
      for (const item of items) {
        const insights = await connector.analytics.mediaInsights({ accessToken, account, item })
        const points: MetricPoint[] = Object.entries(insights).map(([metric, value]) => ({
          metric,
          day: dayOf(now),
          value
        }))
        if (points.length > 0)
          pointsStored += this.repo.upsertPoints(accountId, 'media', item.externalId, points)
      }

      const unavailable = Array.from(
        new Set([
          ...previous.unavailable.filter((m) => !daily.points.some((p) => p.metric === m)),
          ...daily.unavailable
        ])
      )
      this.repo.recordSync(accountId, { lastError: null, unavailable })
      log.info(
        `Métricas de @${account.username}: ${pointsStored} valores, ${mediaStored} publicaciones`
      )
      return { accountId, ok: true, message: 'Métricas actualizadas', pointsStored, mediaStored }
    } catch (error) {
      const appError = AppError.from(error)
      this.repo.recordSync(accountId, {
        lastError: appError.message,
        unavailable: previous.unavailable
      })
      if (appError.code === 'UNAUTHORIZED') this.accounts.markError(accountId, appError.message)
      log.warn(`Fallo al sincronizar @${account.username}: ${appError.message}`)
      return { accountId, ok: false, message: appError.message, pointsStored, mediaStored }
    }
  }

  async syncAll(now = new Date()): Promise<SyncResult[]> {
    const results: SyncResult[] = []
    for (const account of this.accounts.list(now)) {
      if (account.status === 'expired' || account.status === 'revoked') continue
      results.push(await this.sync(account.id, now))
    }
    return results
  }

  overview(query: AnalyticsQuery, now = new Date()): AnalyticsOverview {
    const { accountId, days } = query
    const toDay = dayOf(new Date(now.getTime() - DAY_MS))
    const fromDay = dayOf(new Date(now.getTime() - days * DAY_MS))
    const prevFrom = dayOf(new Date(now.getTime() - 2 * days * DAY_MS))
    const prevTo = dayOf(new Date(now.getTime() - (days + 1) * DAY_MS))
    const info = this.repo.syncInfo(accountId)
    const current = this.repo.accountSeries(accountId, fromDay, toDay)
    const previous = this.repo.accountSeries(accountId, prevFrom, prevTo)
    const followersNow = this.repo
      .accountSeries(accountId, fromDay, dayOf(now))
      .filter((p) => p.metric === 'followers_count')

    const series: Record<string, MetricPoint[]> = {}
    for (const p of current) (series[p.metric] ??= []).push(p)
    if (followersNow.length > 0) series['followers_count'] = followersNow

    const sum = (points: MetricPoint[], metric: string): number =>
      points.filter((p) => p.metric === metric).reduce((a, p) => a + p.value, 0)
    const stats: Stat[] = accountMetricsFor(this.accounts.get(accountId).network).map((metric) => {
      const label = METRIC_LABELS[metric] ?? metric
      if (metric === 'followers_count') {
        const last = followersNow.at(-1)?.value ?? null
        const first = followersNow[0]?.value ?? null
        return {
          metric,
          label,
          value: last ?? 0,
          change:
            last !== null && first !== null && followersNow.length > 1
              ? relativeChange(last, first)
              : null,
          available: last !== null
        }
      }
      const has = current.some((p) => p.metric === metric)
      const cur = sum(current, metric)
      const prev = sum(previous, metric)
      return {
        metric,
        label,
        value: cur,
        change: previous.some((p) => p.metric === metric) ? relativeChange(cur, prev) : null,
        available: has && !info.unavailable.includes(metric)
      }
    })

    const allMedia = this.repo.listRemoteMedia(accountId, 50)
    const fromIso = new Date(`${fromDay}T00:00:00`).toISOString()
    const inRange = allMedia.filter((m) => m.publishedAt >= fromIso)
    const score = (m: RemoteMedia): number =>
      m.insights['reach'] ?? m.insights['views'] ?? m.likeCount + m.commentsCount
    const topMedia = [...(inRange.length > 0 ? inRange : allMedia)]
      .sort((a, b) => score(b) - score(a))
      .slice(0, 5)

    return {
      accountId,
      days,
      from: fromDay,
      to: toDay,
      lastSyncAt: info.lastSyncAt,
      lastError: info.lastError,
      unavailable: info.unavailable,
      stats,
      series,
      topMedia,
      recentMedia: allMedia.slice(0, 10)
    }
  }

  /** Texto compacto con las métricas, para que Claude redacte el resumen semanal. */
  digest(query: AnalyticsQuery, now = new Date()): string {
    const account = this.accounts.get(query.accountId)
    const o = this.overview(query, now)
    const pct = (c: number | null): string =>
      c === null ? 'sin base' : `${c >= 0 ? '+' : ''}${Math.round(c * 100)} %`
    const lines: string[] = [
      `Cuenta: @${account.username} (${account.network}). Periodo: últimos ${o.days} días (${o.from} a ${o.to}).`,
      o.lastSyncAt ? `Última sincronización: ${o.lastSyncAt}.` : 'Sin sincronizar todavía.',
      'Métricas del periodo (valor, variación frente al periodo anterior):'
    ]
    for (const s of o.stats) {
      if (!s.available) continue
      lines.push(`- ${s.label}: ${Math.round(s.value).toLocaleString('es')} (${pct(s.change)})`)
    }
    if (o.unavailable.length > 0)
      lines.push(`Métricas no disponibles para esta cuenta: ${o.unavailable.join(', ')}.`)
    if (o.topMedia.length > 0) {
      lines.push('Publicaciones con mejor rendimiento:')
      o.topMedia.forEach((m, i) => {
        const ins = Object.entries(m.insights)
          .map(([k, v]) => `${METRIC_LABELS[k] ?? k} ${Math.round(v)}`)
          .join(', ')
        lines.push(
          `${i + 1}. [${m.productType || m.mediaType}] ${m.publishedAt.slice(0, 10)} · ${m.likeCount} me gusta, ${m.commentsCount} comentarios${ins ? `, ${ins}` : ''} · «${m.caption.slice(0, 120).replace(/\s+/g, ' ')}»`
        )
      })
    }
    return lines.join('\n').slice(0, 7500)
  }
}
