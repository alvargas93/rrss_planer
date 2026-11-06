import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { mediaAssets } from '../db/schema'
import { newId, nowIso } from '../db/helpers'
import { mediaUrl, type MediaAsset, type MediaKind } from '@shared/domain/media'
import { AppError } from '@shared/domain/errors'

type Row = typeof mediaAssets.$inferSelect

export function toMediaAsset(row: Row): MediaAsset {
  return {
    id: row.id,
    fileName: row.fileName,
    originalName: row.originalName,
    kind: row.kind as MediaKind,
    mime: row.mime,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    altText: row.altText,
    derivedFrom: row.derivedFrom,
    url: mediaUrl(row.fileName),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export interface MediaCreate {
  id?: string
  fileName: string
  originalName: string
  kind: MediaKind
  mime: string
  width: number | null
  height: number | null
  durationMs: number | null
  sizeBytes: number
  sha256: string
}

export class MediaRepository {
  constructor(private readonly db: Db) {}

  list(): MediaAsset[] {
    return this.db
      .select()
      .from(mediaAssets)
      .where(isNull(mediaAssets.deletedAt))
      .orderBy(desc(mediaAssets.createdAt))
      .all()
      .map(toMediaAsset)
  }

  listByIds(ids: string[]): MediaAsset[] {
    if (ids.length === 0) return []
    return this.db
      .select()
      .from(mediaAssets)
      .where(and(inArray(mediaAssets.id, ids), isNull(mediaAssets.deletedAt)))
      .all()
      .map(toMediaAsset)
  }

  get(id: string): MediaAsset {
    const row = this.db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).get()
    if (!row || row.deletedAt) throw new AppError('NOT_FOUND', 'El archivo no existe')
    return toMediaAsset(row)
  }

  findBySha(sha256: string): MediaAsset | null {
    const row = this.db.select().from(mediaAssets).where(eq(mediaAssets.sha256, sha256)).get()
    if (!row) return null
    if (row.deletedAt) {
      // Se vuelve a importar un archivo borrado: lo restauramos en vez de duplicarlo.
      this.db
        .update(mediaAssets)
        .set({ deletedAt: null, updatedAt: nowIso() })
        .where(eq(mediaAssets.id, row.id))
        .run()
    }
    return toMediaAsset({ ...row, deletedAt: null })
  }

  create(input: MediaCreate): MediaAsset {
    const now = nowIso()
    const row: Row = {
      id: input.id ?? newId(),
      fileName: input.fileName,
      originalName: input.originalName,
      kind: input.kind,
      mime: input.mime,
      width: input.width,
      height: input.height,
      durationMs: input.durationMs,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      altText: '',
      derivedFrom: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    }
    this.db.insert(mediaAssets).values(row).run()
    return toMediaAsset(row)
  }

  update(id: string, patch: { altText?: string }): MediaAsset {
    this.get(id)
    this.db
      .update(mediaAssets)
      .set({ ...patch, updatedAt: nowIso() })
      .where(eq(mediaAssets.id, id))
      .run()
    return this.get(id)
  }

  /** Borrado lógico; el fichero se conserva hasta la limpieza de la Fase 8. */
  delete(id: string): void {
    this.get(id)
    this.db.update(mediaAssets).set({ deletedAt: nowIso() }).where(eq(mediaAssets.id, id)).run()
  }
}
