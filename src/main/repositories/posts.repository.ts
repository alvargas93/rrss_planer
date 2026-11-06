import { and, asc, desc, eq, gte, inArray, isNull, lte, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client'
import { mediaAssets, postMedia, posts, postVariants } from '../db/schema'
import { newId, nowIso, parseJsonArray, parseJsonRecord } from '../db/helpers'
import type {
  Post,
  PostCreate,
  PostDetail,
  PostListFilter,
  PostStatus,
  PostSummary,
  PostVariant,
  PostVariantInput
} from '@shared/domain/posts'
import type { Network, PostKind } from '@shared/connectors/networks'
import { extractHashtags } from '@shared/connectors/networks'
import { AppError } from '@shared/domain/errors'
import { toMediaAsset } from './media.repository'

type PostRow = typeof posts.$inferSelect
type VariantRow = typeof postVariants.$inferSelect

function toPost(row: PostRow): Post {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    pillarId: row.pillarId,
    ideaId: row.ideaId,
    status: row.status as PostStatus,
    scheduledAt: row.scheduledAt,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function toVariant(row: VariantRow): PostVariant {
  return {
    id: row.id,
    postId: row.postId,
    network: row.network as Network,
    kind: row.kind as PostKind,
    text: row.text,
    hashtags: parseJsonArray(row.hashtagsJson),
    extra: parseJsonRecord(row.extraJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export class PostsRepository {
  constructor(private readonly db: Db) {}

  list(filter: PostListFilter): PostSummary[] {
    const conditions: SQL[] = [isNull(posts.deletedAt)]
    if (filter.unscheduledOnly) conditions.push(isNull(posts.scheduledAt))
    if (filter.from) conditions.push(gte(posts.scheduledAt, filter.from))
    if (filter.to) conditions.push(lte(posts.scheduledAt, filter.to))
    if (filter.status) conditions.push(eq(posts.status, filter.status))

    const rows = this.db
      .select()
      .from(posts)
      .where(and(...conditions))
      .orderBy(asc(posts.scheduledAt), desc(posts.updatedAt))
      .all()
    if (rows.length === 0) return []

    const ids = rows.map((row) => row.id)
    const variants = this.db
      .select()
      .from(postVariants)
      .where(inArray(postVariants.postId, ids))
      .all()
    const media = this.db
      .select({ postId: postMedia.postId, sortOrder: postMedia.sortOrder, asset: mediaAssets })
      .from(postMedia)
      .innerJoin(mediaAssets, eq(postMedia.mediaId, mediaAssets.id))
      .where(and(inArray(postMedia.postId, ids), isNull(mediaAssets.deletedAt)))
      .orderBy(asc(postMedia.sortOrder))
      .all()

    return rows.map((row) => {
      const postMediaRows = media.filter((m) => m.postId === row.id)
      const first = postMediaRows[0]
      return {
        ...toPost(row),
        networks: variants.filter((v) => v.postId === row.id).map((v) => v.network as Network),
        mediaCount: postMediaRows.length,
        thumbnailUrl: first ? toMediaAsset(first.asset).url : null
      }
    })
  }

  summary(id: string): PostSummary {
    const row = this.getRow(id)
    const [summary] = this.list({ unscheduledOnly: false }).filter((p) => p.id === row.id)
    if (!summary) throw new AppError('NOT_FOUND', 'La publicación no existe')
    return summary
  }

  get(id: string): PostDetail {
    const row = this.getRow(id)
    const variants = this.db
      .select()
      .from(postVariants)
      .where(eq(postVariants.postId, id))
      .orderBy(asc(postVariants.createdAt))
      .all()
      .map(toVariant)
    const media = this.db
      .select({ asset: mediaAssets })
      .from(postMedia)
      .innerJoin(mediaAssets, eq(postMedia.mediaId, mediaAssets.id))
      .where(and(eq(postMedia.postId, id), isNull(mediaAssets.deletedAt)))
      .orderBy(asc(postMedia.sortOrder))
      .all()
      .map((m) => toMediaAsset(m.asset))
    return { post: toPost(row), variants, media }
  }

  create(input: PostCreate): PostDetail {
    const now = nowIso()
    const id = newId()
    this.db.transaction((tx) => {
      tx.insert(posts)
        .values({
          id,
          title: input.title,
          body: input.body,
          pillarId: input.pillarId,
          ideaId: input.ideaId,
          status: input.scheduledAt ? 'scheduled' : 'draft',
          scheduledAt: input.scheduledAt,
          notes: input.notes,
          createdAt: now,
          updatedAt: now,
          deletedAt: null
        })
        .run()
      this.writeVariants(tx, id, input.variants, now)
      this.writeMedia(tx, id, input.mediaIds)
    })
    return this.get(id)
  }

  update(id: string, patch: Partial<PostCreate>): PostDetail {
    const current = this.getRow(id)
    const now = nowIso()
    const { variants, mediaIds, scheduledAt, ...rest } = patch
    this.db.transaction((tx) => {
      const scheduledChanged = scheduledAt !== undefined
      const nextScheduledAt = scheduledChanged ? scheduledAt : current.scheduledAt
      const status = this.nextStatus(current.status as PostStatus, nextScheduledAt)
      tx.update(posts)
        .set({ ...rest, scheduledAt: nextScheduledAt, status, updatedAt: now })
        .where(eq(posts.id, id))
        .run()
      if (variants !== undefined) {
        tx.delete(postVariants).where(eq(postVariants.postId, id)).run()
        this.writeVariants(tx, id, variants, now)
      }
      if (mediaIds !== undefined) {
        tx.delete(postMedia).where(eq(postMedia.postId, id)).run()
        this.writeMedia(tx, id, mediaIds)
      }
    })
    return this.get(id)
  }

  schedule(id: string, scheduledAt: string | null): PostSummary {
    const current = this.getRow(id)
    this.db
      .update(posts)
      .set({
        scheduledAt,
        status: this.nextStatus(current.status as PostStatus, scheduledAt),
        updatedAt: nowIso()
      })
      .where(eq(posts.id, id))
      .run()
    return this.summary(id)
  }

  /** Borrado lógico. */
  delete(id: string): void {
    this.getRow(id)
    this.db.update(posts).set({ deletedAt: nowIso() }).where(eq(posts.id, id)).run()
  }

  countByStatus(status: PostStatus): number {
    return this.db
      .select({ id: posts.id })
      .from(posts)
      .where(and(isNull(posts.deletedAt), eq(posts.status, status)))
      .all().length
  }

  // ------------------------------------------------------------ privados

  private getRow(id: string): PostRow {
    const row = this.db.select().from(posts).where(eq(posts.id, id)).get()
    if (!row || row.deletedAt) throw new AppError('NOT_FOUND', 'La publicación no existe')
    return row
  }

  /**
   * En Fase 2 solo existen borrador y programada: tener fecha = programada.
   * Los estados de publicación real (publishing, published…) llegan con los conectores
   * y no se tocan desde aquí.
   */
  private nextStatus(current: PostStatus, scheduledAt: string | null): PostStatus {
    if (current === 'draft' || current === 'scheduled' || current === 'cancelled') {
      return scheduledAt ? 'scheduled' : 'draft'
    }
    return current
  }

  private writeVariants(tx: Db, postId: string, variants: PostVariantInput[], now: string): void {
    for (const variant of variants) {
      tx.insert(postVariants)
        .values({
          id: newId(),
          postId,
          network: variant.network,
          kind: variant.kind,
          text: variant.text,
          hashtagsJson: JSON.stringify(extractHashtags(variant.text)),
          extraJson: JSON.stringify(variant.extra),
          createdAt: now,
          updatedAt: now
        })
        .run()
    }
  }

  private writeMedia(tx: Db, postId: string, mediaIds: string[]): void {
    mediaIds.forEach((mediaId, index) => {
      tx.insert(postMedia).values({ postId, mediaId, sortOrder: index }).run()
    })
  }
}
