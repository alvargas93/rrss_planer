import { asc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { contentPillars } from '../db/schema'
import { newId, nowIso } from '../db/helpers'
import type { Pillar, PillarCreate, PillarUpdate } from '@shared/domain/pillars'
import { AppError } from '@shared/domain/errors'

type Row = typeof contentPillars.$inferSelect

function toPillar(row: Row): Pillar {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export class PillarsRepository {
  constructor(private readonly db: Db) {}

  list(): Pillar[] {
    return this.db
      .select()
      .from(contentPillars)
      .where(isNull(contentPillars.deletedAt))
      .orderBy(asc(contentPillars.sortOrder), asc(contentPillars.name))
      .all()
      .map(toPillar)
  }

  get(id: string): Pillar {
    const row = this.db.select().from(contentPillars).where(eq(contentPillars.id, id)).get()
    if (!row || row.deletedAt) throw new AppError('NOT_FOUND', 'El pilar no existe')
    return toPillar(row)
  }

  create(input: PillarCreate): Pillar {
    const now = nowIso()
    const max = this.db
      .select({ value: sql<number>`coalesce(max(${contentPillars.sortOrder}), -1)` })
      .from(contentPillars)
      .get()
    const row: Row = {
      id: newId(),
      name: input.name,
      description: input.description,
      color: input.color,
      sortOrder: (max?.value ?? -1) + 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    }
    this.db.insert(contentPillars).values(row).run()
    return toPillar(row)
  }

  update({ id, patch }: PillarUpdate): Pillar {
    this.get(id)
    this.db
      .update(contentPillars)
      .set({ ...patch, updatedAt: nowIso() })
      .where(eq(contentPillars.id, id))
      .run()
    return this.get(id)
  }

  /** Borrado real: las ideas y publicaciones que lo usaban quedan sin pilar (FK set null). */
  delete(id: string): void {
    this.get(id)
    this.db.delete(contentPillars).where(eq(contentPillars.id, id)).run()
  }

  count(): number {
    return this.list().length
  }
}
