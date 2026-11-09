import { desc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { videoProjects } from '../db/schema'
import { newId, nowIso } from '../db/helpers'
import {
  TimelineSchema,
  type Fit,
  type Timeline,
  type VideoFormat,
  type VideoProject
} from '@shared/domain/video'
import { AppError } from '@shared/domain/errors'

type Row = typeof videoProjects.$inferSelect

function parseTimeline(json: string): Timeline {
  try {
    const parsed = TimelineSchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : TimelineSchema.parse({})
  } catch {
    return TimelineSchema.parse({})
  }
}

function toProject(row: Row): VideoProject {
  return {
    id: row.id,
    name: row.name,
    format: row.format as VideoFormat,
    fit: row.fit as Fit,
    timeline: parseTimeline(row.timelineJson),
    lastExportMediaId: row.lastExportMediaId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export class VideoRepository {
  constructor(private readonly db: Db) {}

  list(): VideoProject[] {
    return this.db
      .select()
      .from(videoProjects)
      .where(isNull(videoProjects.deletedAt))
      .orderBy(desc(videoProjects.updatedAt))
      .all()
      .map(toProject)
  }

  get(id: string): VideoProject {
    const row = this.db.select().from(videoProjects).where(eq(videoProjects.id, id)).get()
    if (!row || row.deletedAt) throw new AppError('NOT_FOUND', 'El proyecto de vídeo no existe')
    return toProject(row)
  }

  create(input: { name: string; format: VideoFormat; fit: Fit; timeline: Timeline }): VideoProject {
    const now = nowIso()
    const id = newId()
    this.db
      .insert(videoProjects)
      .values({
        id,
        name: input.name,
        format: input.format,
        fit: input.fit,
        timelineJson: JSON.stringify(input.timeline),
        lastExportMediaId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      })
      .run()
    return this.get(id)
  }

  update(
    id: string,
    patch: Partial<{
      name: string
      format: VideoFormat
      fit: Fit
      timeline: Timeline
      lastExportMediaId: string | null
    }>
  ): VideoProject {
    this.get(id)
    const { timeline, ...rest } = patch
    this.db
      .update(videoProjects)
      .set({
        ...rest,
        ...(timeline ? { timelineJson: JSON.stringify(timeline) } : {}),
        updatedAt: nowIso()
      })
      .where(eq(videoProjects.id, id))
      .run()
    return this.get(id)
  }

  delete(id: string): void {
    this.get(id)
    this.db.update(videoProjects).set({ deletedAt: nowIso() }).where(eq(videoProjects.id, id)).run()
  }
}
