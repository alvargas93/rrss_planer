import { and, desc, eq, inArray, isNull, not, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client'
import { ideas } from '../db/schema'
import { newId, nowIso, parseJsonArray } from '../db/helpers'
import type { Idea, IdeaCreate, IdeaFilter, IdeaStatus, IdeaUpdate } from '@shared/domain/ideas'
import { AppError } from '@shared/domain/errors'

type Row = typeof ideas.$inferSelect

function toIdea(row: Row): Idea {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    pillarId: row.pillarId,
    status: row.status as IdeaStatus,
    source: row.source,
    tags: parseJsonArray(row.tagsJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export class IdeasRepository {
  constructor(private readonly db: Db) {}

  list(filter: IdeaFilter): Idea[] {
    const conditions: SQL[] = [isNull(ideas.deletedAt)]
    if (filter.status) conditions.push(eq(ideas.status, filter.status))
    else if (!filter.includeArchived)
      conditions.push(not(inArray(ideas.status, ['used', 'discarded'])))
    if (filter.pillarId) conditions.push(eq(ideas.pillarId, filter.pillarId))
    return this.db
      .select()
      .from(ideas)
      .where(and(...conditions))
      .orderBy(desc(ideas.updatedAt))
      .all()
      .map(toIdea)
  }

  get(id: string): Idea {
    const row = this.db.select().from(ideas).where(eq(ideas.id, id)).get()
    if (!row || row.deletedAt) throw new AppError('NOT_FOUND', 'La idea no existe')
    return toIdea(row)
  }

  create(input: IdeaCreate): Idea {
    const now = nowIso()
    const row: Row = {
      id: newId(),
      title: input.title,
      notes: input.notes,
      pillarId: input.pillarId,
      status: input.status,
      source: input.source,
      tagsJson: JSON.stringify(input.tags),
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    }
    this.db.insert(ideas).values(row).run()
    return toIdea(row)
  }

  update({ id, patch }: IdeaUpdate): Idea {
    this.get(id)
    const { tags, ...rest } = patch
    this.db
      .update(ideas)
      .set({
        ...rest,
        ...(tags !== undefined ? { tagsJson: JSON.stringify(tags) } : {}),
        updatedAt: nowIso()
      })
      .where(eq(ideas.id, id))
      .run()
    return this.get(id)
  }

  /** Borrado lógico. */
  delete(id: string): void {
    this.get(id)
    this.db.update(ideas).set({ deletedAt: nowIso() }).where(eq(ideas.id, id)).run()
  }

  countByStatus(status: IdeaStatus): number {
    return this.db
      .select({ id: ideas.id })
      .from(ideas)
      .where(and(isNull(ideas.deletedAt), eq(ideas.status, status)))
      .all().length
  }
}
