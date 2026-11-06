import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { tasks } from '../db/schema'
import { newId, nowIso } from '../db/helpers'
import type { Task, TaskCreate, TaskPriority, TaskStatus, TaskUpdate } from '@shared/domain/tasks'
import { AppError } from '@shared/domain/errors'

type Row = typeof tasks.$inferSelect

function toTask(row: Row): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    dueAt: row.dueAt,
    ideaId: row.ideaId,
    postId: row.postId,
    sortOrder: row.sortOrder,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export class TasksRepository {
  constructor(private readonly db: Db) {}

  list(): Task[] {
    return this.db
      .select()
      .from(tasks)
      .where(isNull(tasks.deletedAt))
      .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt))
      .all()
      .map(toTask)
  }

  listByStatus(status: TaskStatus): Task[] {
    return this.list().filter((task) => task.status === status)
  }

  get(id: string): Task {
    const row = this.db.select().from(tasks).where(eq(tasks.id, id)).get()
    if (!row || row.deletedAt) throw new AppError('NOT_FOUND', 'La tarea no existe')
    return toTask(row)
  }

  create(input: TaskCreate): Task {
    const now = nowIso()
    const max = this.db
      .select({ value: sql<number>`coalesce(max(${tasks.sortOrder}), -1)` })
      .from(tasks)
      .where(and(isNull(tasks.deletedAt), eq(tasks.status, input.status)))
      .get()
    const row: Row = {
      id: newId(),
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      dueAt: input.dueAt,
      ideaId: input.ideaId,
      postId: input.postId,
      sortOrder: (max?.value ?? -1) + 1,
      completedAt: input.status === 'done' ? now : null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    }
    this.db.insert(tasks).values(row).run()
    return toTask(row)
  }

  update({ id, patch }: TaskUpdate): Task {
    const current = this.get(id)
    const completedAt =
      patch.status === undefined || patch.status === current.status
        ? current.completedAt
        : patch.status === 'done'
          ? nowIso()
          : null
    this.db
      .update(tasks)
      .set({ ...patch, completedAt, updatedAt: nowIso() })
      .where(eq(tasks.id, id))
      .run()
    return this.get(id)
  }

  /** Reescribe el orden de una columna entera. */
  setColumnOrder(status: TaskStatus, orderedIds: string[]): void {
    const now = nowIso()
    this.db.transaction((tx) => {
      orderedIds.forEach((id, index) => {
        const completedAt = status === 'done' ? sql`coalesce(${tasks.completedAt}, ${now})` : null
        tx.update(tasks)
          .set({ status, sortOrder: index, completedAt, updatedAt: now })
          .where(eq(tasks.id, id))
          .run()
      })
    })
  }

  /** Borrado lógico. */
  delete(id: string): void {
    this.get(id)
    this.db.update(tasks).set({ deletedAt: nowIso() }).where(eq(tasks.id, id)).run()
  }
}
