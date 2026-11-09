import { and, desc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { profileAnalyses, profileSnapshots, trackedProfiles } from '../db/schema'
import { newId, nowIso } from '../db/helpers'
import {
  AnalysisSchema,
  ProfileDataSchema,
  type Analysis,
  type Profile,
  type ProfileCreate,
  type Snapshot,
  type SnapshotSource
} from '@shared/domain/analysis'
import type { Network } from '@shared/connectors/networks'
import { AppError } from '@shared/domain/errors'
import type { AnalysisCreate, AnalysisStore } from '../services/analysis.service'

type ProfileRow = typeof trackedProfiles.$inferSelect
type SnapshotRow = typeof profileSnapshots.$inferSelect
type AnalysisRow = typeof profileAnalyses.$inferSelect

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    network: row.network as Network,
    username: row.username,
    displayName: row.displayName,
    isOwn: row.isOwn,
    accountId: row.accountId,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function toSnapshot(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    profileId: row.profileId,
    source: row.source as SnapshotSource,
    capturedAt: row.capturedAt,
    // Se valida al leer: es una frontera entre el disco y la app.
    data: ProfileDataSchema.parse(JSON.parse(row.dataJson)),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function toAnalysis(row: AnalysisRow): Analysis {
  const base = {
    id: row.id,
    profileId: row.profileId,
    snapshotId: row.snapshotId,
    instruction: row.instruction,
    model: row.model,
    costUsd: row.costUsd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    kind: row.kind,
    result: JSON.parse(row.resultJson) as unknown
  }
  return AnalysisSchema.parse(
    row.kind === 'plan'
      ? {
          ...base,
          request: JSON.parse(row.requestJson) as unknown,
          applied: JSON.parse(row.appliedJson) as unknown
        }
      : base
  )
}

/** Cuentas analizadas, sus datos y sus análisis, en SQLite. */
export class AnalysisRepository implements AnalysisStore {
  constructor(private readonly db: Db) {}

  // ------------------------------------------------------------ cuentas

  listProfiles(): Profile[] {
    return this.db
      .select()
      .from(trackedProfiles)
      .where(isNull(trackedProfiles.deletedAt))
      .orderBy(desc(trackedProfiles.isOwn), trackedProfiles.username)
      .all()
      .map(toProfile)
  }

  getProfile(id: string): Profile {
    const row = this.db.select().from(trackedProfiles).where(eq(trackedProfiles.id, id)).get()
    if (!row || row.deletedAt) throw new AppError('NOT_FOUND', 'La cuenta analizada no existe')
    return toProfile(row)
  }

  createProfile(input: ProfileCreate): Profile {
    const duplicate = this.listProfiles().find(
      (p) =>
        p.network === input.network && p.username.toLowerCase() === input.username.toLowerCase()
    )
    if (duplicate) {
      throw new AppError('CONFLICT', `Ya tienes @${input.username} en la lista.`)
    }
    const now = nowIso()
    const id = newId()
    this.db
      .insert(trackedProfiles)
      .values({ id, ...input, createdAt: now, updatedAt: now, deletedAt: null })
      .run()
    return this.getProfile(id)
  }

  updateProfile(id: string, patch: Partial<ProfileCreate>): Profile {
    this.getProfile(id)
    this.db
      .update(trackedProfiles)
      .set({ ...patch, updatedAt: nowIso() })
      .where(eq(trackedProfiles.id, id))
      .run()
    return this.getProfile(id)
  }

  /** Borrado lógico (sus datos y análisis quedan, pero no se muestran). */
  deleteProfile(id: string): void {
    this.getProfile(id)
    this.db
      .update(trackedProfiles)
      .set({ deletedAt: nowIso() })
      .where(eq(trackedProfiles.id, id))
      .run()
  }

  // ------------------------------------------------------------ datos

  listSnapshots(profileId: string): Snapshot[] {
    return this.db
      .select()
      .from(profileSnapshots)
      .where(and(eq(profileSnapshots.profileId, profileId), isNull(profileSnapshots.deletedAt)))
      .orderBy(desc(profileSnapshots.capturedAt))
      .all()
      .map(toSnapshot)
  }

  addSnapshot(input: {
    profileId: string
    source: SnapshotSource
    data: Snapshot['data']
    capturedAt: string
  }): Snapshot {
    const now = nowIso()
    const id = newId()
    this.db
      .insert(profileSnapshots)
      .values({
        id,
        profileId: input.profileId,
        source: input.source,
        capturedAt: input.capturedAt,
        dataJson: JSON.stringify(input.data),
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      })
      .run()
    const row = this.db.select().from(profileSnapshots).where(eq(profileSnapshots.id, id)).get()
    return toSnapshot(row!)
  }

  deleteSnapshot(id: string): void {
    this.db
      .update(profileSnapshots)
      .set({ deletedAt: nowIso() })
      .where(eq(profileSnapshots.id, id))
      .run()
  }

  // ------------------------------------------------------------ análisis

  listAnalyses(profileId: string): Analysis[] {
    return this.db
      .select()
      .from(profileAnalyses)
      .where(and(eq(profileAnalyses.profileId, profileId), isNull(profileAnalyses.deletedAt)))
      .orderBy(desc(profileAnalyses.createdAt))
      .all()
      .map(toAnalysis)
  }

  getAnalysis(id: string): Analysis {
    const row = this.db.select().from(profileAnalyses).where(eq(profileAnalyses.id, id)).get()
    if (!row || row.deletedAt) throw new AppError('NOT_FOUND', 'El análisis no existe')
    return toAnalysis(row)
  }

  addAnalysis(input: AnalysisCreate): Analysis {
    const now = nowIso()
    const id = newId()
    this.db
      .insert(profileAnalyses)
      .values({
        id,
        profileId: input.profileId,
        kind: input.kind,
        snapshotId: input.snapshotId,
        instruction: input.instruction,
        resultJson: JSON.stringify(input.result),
        requestJson: input.kind === 'plan' ? JSON.stringify(input.request) : '{}',
        appliedJson: '{}',
        model: input.model,
        costUsd: input.costUsd,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      })
      .run()
    return this.getAnalysis(id)
  }

  setApplied(id: string, applied: Record<string, string>): Analysis {
    this.db
      .update(profileAnalyses)
      .set({ appliedJson: JSON.stringify(applied), updatedAt: nowIso() })
      .where(eq(profileAnalyses.id, id))
      .run()
    return this.getAnalysis(id)
  }

  deleteAnalysis(id: string): void {
    this.db
      .update(profileAnalyses)
      .set({ deletedAt: nowIso() })
      .where(eq(profileAnalyses.id, id))
      .run()
  }
}
