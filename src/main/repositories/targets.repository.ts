import { and, asc, eq, inArray, isNotNull, lte, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client'
import { postTargets } from '../db/schema'
import { newId, nowIso } from '../db/helpers'
import type { PostTarget, TargetMode, TargetStatus } from '@shared/domain/publishing'
import type { Network } from '@shared/connectors/networks'
import { AppError } from '@shared/domain/errors'

type Row = typeof postTargets.$inferSelect

function toTarget(row: Row): PostTarget {
  return {
    id: row.id,
    postId: row.postId,
    variantId: row.variantId,
    accountId: row.accountId,
    network: row.network as Network,
    mode: row.mode as TargetMode,
    status: row.status as TargetStatus,
    scheduledAt: row.scheduledAt,
    externalPostId: row.externalPostId,
    externalUrl: row.externalUrl,
    publishedAt: row.publishedAt,
    attempts: row.attempts,
    lastError: row.lastError,
    nextAttemptAt: row.nextAttemptAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export class TargetsRepository {
  constructor(private readonly db: Db) {}

  listByPost(postId: string): PostTarget[] {
    return this.db
      .select()
      .from(postTargets)
      .where(eq(postTargets.postId, postId))
      .orderBy(asc(postTargets.network))
      .all()
      .map(toTarget)
  }

  /** Destinos publicados por API desde una cuenta (para enlazar métricas con posts). */
  listPublishedByAccount(accountId: string): PostTarget[] {
    return this.db
      .select()
      .from(postTargets)
      .where(and(eq(postTargets.accountId, accountId), eq(postTargets.status, 'published')))
      .all()
      .map(toTarget)
  }

  listByPosts(postIds: string[]): PostTarget[] {
    if (postIds.length === 0) return []
    return this.db
      .select()
      .from(postTargets)
      .where(inArray(postTargets.postId, postIds))
      .all()
      .map(toTarget)
  }

  get(id: string): PostTarget {
    const row = this.db.select().from(postTargets).where(eq(postTargets.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND', 'El destino de publicación no existe')
    return toTarget(row)
  }

  /** Destinos cuya hora ya pasó y siguen pendientes o esperan reintento. */
  listDue(now: string): PostTarget[] {
    const conditions: SQL[] = [
      inArray(postTargets.status, ['pending', 'queued', 'failed']),
      isNotNull(postTargets.scheduledAt),
      lte(postTargets.scheduledAt, now)
    ]
    return this.db
      .select()
      .from(postTargets)
      .where(and(...conditions))
      .orderBy(asc(postTargets.scheduledAt))
      .all()
      .map(toTarget)
      .filter((t) => t.status !== 'failed' || (t.nextAttemptAt !== null && t.nextAttemptAt <= now))
  }

  create(input: {
    postId: string
    variantId: string
    accountId: string | null
    network: Network
    mode: TargetMode
    scheduledAt: string | null
  }): PostTarget {
    const now = nowIso()
    const id = newId()
    this.db
      .insert(postTargets)
      .values({
        id,
        postId: input.postId,
        variantId: input.variantId,
        accountId: input.accountId,
        network: input.network,
        mode: input.mode,
        status: 'pending',
        scheduledAt: input.scheduledAt,
        externalPostId: null,
        externalUrl: null,
        publishedAt: null,
        attempts: 0,
        lastError: null,
        nextAttemptAt: null,
        createdAt: now,
        updatedAt: now
      })
      .run()
    return this.get(id)
  }

  update(id: string, patch: Partial<Omit<Row, 'id' | 'postId' | 'createdAt'>>): PostTarget {
    this.db
      .update(postTargets)
      .set({ ...patch, updatedAt: nowIso() })
      .where(eq(postTargets.id, id))
      .run()
    return this.get(id)
  }

  delete(id: string): void {
    this.db.delete(postTargets).where(eq(postTargets.id, id)).run()
  }

  deleteByPost(postId: string): void {
    this.db.delete(postTargets).where(eq(postTargets.postId, postId)).run()
  }
}
