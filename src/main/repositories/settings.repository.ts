import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { settings } from '../db/schema'

/**
 * Contrato del repositorio de ajustes. El servicio depende de esta interfaz,
 * no de SQLite: así se prueba con una implementación en memoria y, en la v2,
 * se puede sustituir por un repositorio remoto.
 */
export interface SettingsRepository {
  readAll(): Record<string, unknown>
  write(key: string, value: unknown): void
  clear(): void
}

export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly db: Db) {}

  readAll(): Record<string, unknown> {
    const rows = this.db.select().from(settings).all()
    const result: Record<string, unknown> = {}
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.valueJson)
      } catch {
        // Un valor corrupto no debe impedir arrancar: se ignora y se recrea con defaults.
        result[row.key] = undefined
      }
    }
    return result
  }

  write(key: string, value: unknown): void {
    const now = new Date().toISOString()
    const valueJson = JSON.stringify(value)
    this.db
      .insert(settings)
      .values({ key, valueJson, updatedAt: now })
      .onConflictDoUpdate({ target: settings.key, set: { valueJson, updatedAt: now } })
      .run()
  }

  clear(): void {
    this.db.delete(settings).run()
  }

  /** Útil para pruebas y depuración. */
  readOne(key: string): unknown {
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get()
    return row ? JSON.parse(row.valueJson) : undefined
  }
}

/** Implementación en memoria para tests unitarios. */
export class InMemorySettingsRepository implements SettingsRepository {
  private store = new Map<string, unknown>()

  readAll(): Record<string, unknown> {
    return Object.fromEntries(this.store)
  }

  write(key: string, value: unknown): void {
    this.store.set(key, structuredClone(value))
  }

  clear(): void {
    this.store.clear()
  }
}
