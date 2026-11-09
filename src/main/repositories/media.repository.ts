import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { mediaAssets } from '../db/schema'
import { newId, nowIso } from '../db/helpers'
import { mediaUrl, type MediaAsset, type MediaKind } from '@shared/domain/media'
import { AppError } from '@shared/domain/errors'

type Row = typeof mediaAssets.$inferSelect

function parseProbe(json: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(json)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

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
    thumbUrl: row.thumbFileName ? mediaUrl(row.thumbFileName) : null,
    probe: parseProbe(row.probeJson),
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
  derivedFrom?: string | null
  altText?: string
  thumbFileName?: string | null
  probe?: Record<string, unknown>
}

export interface MediaPatch {
  altText?: string
  width?: number | null
  height?: number | null
  durationMs?: number | null
  thumbFileName?: string | null
  probe?: Record<string, unknown>
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

  find(id: string): MediaAsset | null {
    const row = this.db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).get()
    return row && !row.deletedAt ? toMediaAsset(row) : null
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

  /** Versión derivada (p. ej. JPEG de un PNG) ya generada para un original. */
  findDerived(parentId: string, mime: string): MediaAsset | null {
    const row = this.db
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.derivedFrom, parentId),
          eq(mediaAssets.mime, mime),
          isNull(mediaAssets.deletedAt)
        )
      )
      .get()
    return row ? toMediaAsset(row) : null
  }

  /** Vídeos a los que falta análisis técnico (duración, miniatura). */
  listUnprocessedVideos(): MediaAsset[] {
    return this.list().filter((a) => a.kind === 'video' && (a.durationMs === null || !a.thumbUrl))
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
      altText: input.altText ?? '',
      derivedFrom: input.derivedFrom ?? null,
      thumbFileName: input.thumbFileName ?? null,
      probeJson: JSON.stringify(input.probe ?? {}),
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    }
    this.db.insert(mediaAssets).values(row).run()
    return toMediaAsset(row)
  }

  update(id: string, patch: MediaPatch): MediaAsset {
    this.get(id)
    const { probe, ...rest } = patch
    this.db
      .update(mediaAssets)
      .set({ ...rest, ...(probe ? { probeJson: JSON.stringify(probe) } : {}), updatedAt: nowIso() })
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
