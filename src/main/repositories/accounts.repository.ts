import { and, asc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accounts } from '../db/schema'
import { newId, nowIso } from '../db/helpers'
import type { Account, AccountStatus } from '@shared/domain/accounts'
import type { Network } from '@shared/connectors/networks'
import { AppError } from '@shared/domain/errors'

type Row = typeof accounts.$inferSelect

function parseRecord(json: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(json)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function parseList(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function toAccount(row: Row): Account {
  return {
    id: row.id,
    network: row.network as Network,
    externalId: row.externalId,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    accountType: row.accountType,
    status: row.status as AccountStatus,
    scopes: parseList(row.scopesJson),
    tokenExpiresAt: row.tokenExpiresAt,
    tokenRefreshedAt: row.tokenRefreshedAt,
    lastError: row.lastError,
    meta: parseRecord(row.metaJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export interface AccountUpsert {
  network: Network
  externalId: string
  username: string
  displayName: string
  avatarUrl: string | null
  accountType: string
  scopes: string[]
  tokenExpiresAt: string | null
  secretKey: string
  meta: Record<string, unknown>
}

export class AccountsRepository {
  constructor(private readonly db: Db) {}

  list(): Account[] {
    return this.db
      .select()
      .from(accounts)
      .where(isNull(accounts.deletedAt))
      .orderBy(asc(accounts.network), asc(accounts.username))
      .all()
      .map(toAccount)
  }

  get(id: string): Account {
    const row = this.db.select().from(accounts).where(eq(accounts.id, id)).get()
    if (!row || row.deletedAt) throw new AppError('NOT_FOUND', 'La cuenta no existe')
    return toAccount(row)
  }

  /** Clave bajo la que está cifrado el token de esta cuenta. */
  secretKeyOf(id: string): string {
    const row = this.db
      .select({ secretKey: accounts.secretKey })
      .from(accounts)
      .where(eq(accounts.id, id))
      .get()
    if (!row) throw new AppError('NOT_FOUND', 'La cuenta no existe')
    return row.secretKey
  }

  findByExternalId(network: Network, externalId: string): Account | null {
    const row = this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.network, network), eq(accounts.externalId, externalId)))
      .get()
    return row ? toAccount(row) : null
  }

  /** Crea la cuenta o, si ya existía (incluso borrada), la actualiza y reactiva. */
  upsert(input: AccountUpsert): Account {
    const now = nowIso()
    const existing = this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.network, input.network), eq(accounts.externalId, input.externalId)))
      .get()
    const values = {
      username: input.username,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      accountType: input.accountType,
      status: 'connected',
      scopesJson: JSON.stringify(input.scopes),
      tokenExpiresAt: input.tokenExpiresAt,
      tokenRefreshedAt: now,
      secretKey: input.secretKey,
      lastError: null,
      metaJson: JSON.stringify(input.meta),
      updatedAt: now,
      deletedAt: null
    }
    if (existing) {
      this.db.update(accounts).set(values).where(eq(accounts.id, existing.id)).run()
      return this.get(existing.id)
    }
    const id = newId()
    this.db
      .insert(accounts)
      .values({
        id,
        network: input.network,
        externalId: input.externalId,
        createdAt: now,
        ...values
      })
      .run()
    return this.get(id)
  }

  update(
    id: string,
    patch: Partial<{
      status: AccountStatus
      tokenExpiresAt: string | null
      tokenRefreshedAt: string | null
      lastError: string | null
      meta: Record<string, unknown>
      avatarUrl: string | null
      username: string
      displayName: string
    }>
  ): Account {
    const { meta, ...rest } = patch
    this.db
      .update(accounts)
      .set({ ...rest, ...(meta ? { metaJson: JSON.stringify(meta) } : {}), updatedAt: nowIso() })
      .where(eq(accounts.id, id))
      .run()
    return this.get(id)
  }

  /** Borrado lógico; el token se elimina aparte (secrets). */
  delete(id: string): void {
    this.get(id)
    this.db
      .update(accounts)
      .set({ deletedAt: nowIso(), status: 'revoked' })
      .where(eq(accounts.id, id))
      .run()
  }
}
