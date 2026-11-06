import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { analyticsSyncs, metricsSnapshots, remoteMedia } from '../db/schema'
import { newId, nowIso } from '../db/helpers'
import type { MetricPoint, RemoteMedia } from '@shared/domain/analytics'
import type { RemoteMediaItem } from '@shared/connectors/Connector'

type RemoteRow = typeof remoteMedia.$inferSelect

export interface SyncInfo {
  lastSyncAt: string | null
  lastError: string | null
  unavailable: string[]
}

export class AnalyticsRepository {
  constructor(private readonly db: Db) {}

  // ------------------------------------------------------------ snapshots

  upsertPoints(
    accountId: string,
    scope: 'account' | 'media',
    externalMediaId: string,
    points: MetricPoint[],
    capturedAt = nowIso()
  ): number {
    let stored = 0
    this.db.transaction((tx) => {
      for (const p of points) {
        tx.insert(metricsSnapshots)
          .values({
            id: newId(),
            accountId,
            scope,
            externalMediaId,
            metric: p.metric,
            day: p.day,
            value: p.value,
            capturedAt
          })
          .onConflictDoUpdate({
            target: [
              metricsSnapshots.accountId,
              metricsSnapshots.scope,
              metricsSnapshots.externalMediaId,
              metricsSnapshots.metric,
              metricsSnapshots.day
            ],
            set: { value: p.value, capturedAt }
          })
          .run()
        stored++
      }
    })
    return stored
  }

  accountSeries(accountId: string, fromDay: string, toDay: string): MetricPoint[] {
    return this.db
      .select({
        metric: metricsSnapshots.metric,
        day: metricsSnapshots.day,
        value: metricsSnapshots.value
      })
      .from(metricsSnapshots)
      .where(
        and(
          eq(metricsSnapshots.accountId, accountId),
          eq(metricsSnapshots.scope, 'account'),
          gte(metricsSnapshots.day, fromDay),
          lte(metricsSnapshots.day, toDay)
        )
      )
      .orderBy(metricsSnapshots.day)
      .all()
  }

  /** Último valor acumulado de cada métrica de cada medio. */
  latestMediaInsights(accountId: string): Map<string, Record<string, number>> {
    const rows = this.db
      .select({
        externalMediaId: metricsSnapshots.externalMediaId,
        metric: metricsSnapshots.metric,
        value: metricsSnapshots.value,
        day: metricsSnapshots.day
      })
      .from(metricsSnapshots)
      .where(and(eq(metricsSnapshots.accountId, accountId), eq(metricsSnapshots.scope, 'media')))
      .orderBy(metricsSnapshots.day)
      .all()
    const map = new Map<string, Record<string, number>>()
    for (const row of rows) {
      const entry = map.get(row.externalMediaId) ?? {}
      entry[row.metric] = row.value // ordenado por día: el último gana
      map.set(row.externalMediaId, entry)
    }
    return map
  }

  /** Primer día con datos de la cuenta (para saber desde cuándo hay histórico). */
  firstDay(accountId: string): string | null {
    const row = this.db
      .select({ day: sql<string | null>`min(${metricsSnapshots.day})` })
      .from(metricsSnapshots)
      .where(and(eq(metricsSnapshots.accountId, accountId), eq(metricsSnapshots.scope, 'account')))
      .get()
    return row?.day ?? null
  }

  // ------------------------------------------------------------ medios remotos

  upsertRemoteMedia(
    accountId: string,
    items: RemoteMediaItem[],
    postIdByExternal: Map<string, string>
  ): number {
    const now = nowIso()
    this.db.transaction((tx) => {
      for (const item of items) {
        const values = {
          mediaType: item.mediaType,
          productType: item.productType,
          caption: item.caption,
          permalink: item.permalink,
          thumbnailUrl: item.thumbnailUrl,
          publishedAt: item.publishedAt,
          likeCount: item.likeCount,
          commentsCount: item.commentsCount,
          postId: postIdByExternal.get(item.externalId) ?? null,
          updatedAt: now
        }
        tx.insert(remoteMedia)
          .values({
            id: newId(),
            accountId,
            externalId: item.externalId,
            createdAt: now,
            ...values
          })
          .onConflictDoUpdate({
            target: [remoteMedia.accountId, remoteMedia.externalId],
            set: values
          })
          .run()
      }
    })
    return items.length
  }

  listRemoteMedia(accountId: string, limit = 50): RemoteMedia[] {
    const insights = this.latestMediaInsights(accountId)
    return this.db
      .select()
      .from(remoteMedia)
      .where(eq(remoteMedia.accountId, accountId))
      .orderBy(desc(remoteMedia.publishedAt))
      .limit(limit)
      .all()
      .map((row: RemoteRow) => ({
        id: row.id,
        accountId: row.accountId,
        externalId: row.externalId,
        mediaType: row.mediaType,
        productType: row.productType,
        caption: row.caption,
        permalink: row.permalink,
        thumbnailUrl: row.thumbnailUrl,
        publishedAt: row.publishedAt,
        likeCount: row.likeCount,
        commentsCount: row.commentsCount,
        postId: row.postId,
        insights: insights.get(row.externalId) ?? {}
      }))
  }

  // ------------------------------------------------------------ sincronizaciones

  syncInfo(accountId: string): SyncInfo {
    const row = this.db
      .select()
      .from(analyticsSyncs)
      .where(eq(analyticsSyncs.accountId, accountId))
      .get()
    if (!row) return { lastSyncAt: null, lastError: null, unavailable: [] }
    let unavailable: string[]
    try {
      unavailable = JSON.parse(row.unavailableJson) as string[]
    } catch {
      unavailable = []
    }
    return { lastSyncAt: row.lastSyncAt, lastError: row.lastError, unavailable }
  }

  recordSync(accountId: string, info: { lastError: string | null; unavailable: string[] }): void {
    const values = {
      lastSyncAt: nowIso(),
      lastError: info.lastError,
      unavailableJson: JSON.stringify(info.unavailable)
    }
    this.db
      .insert(analyticsSyncs)
      .values({ accountId, ...values })
      .onConflictDoUpdate({ target: analyticsSyncs.accountId, set: values })
      .run()
  }
}
