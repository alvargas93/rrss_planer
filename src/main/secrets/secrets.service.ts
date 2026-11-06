import { safeStorage } from 'electron'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { secrets } from '../db/schema'
import { nowIso } from '../db/helpers'
import { AppError } from '@shared/domain/errors'

/**
 * Secretos (claves de API, tokens OAuth) cifrados con el almacén del sistema operativo:
 * DPAPI en Windows, Keychain en macOS. En la base de datos solo se guarda el texto cifrado.
 * El valor en claro vive únicamente en memoria del proceso principal mientras se usa.
 */
export interface SecretStore {
  set(key: string, value: string): void
  get(key: string): string | null
  has(key: string): boolean
  delete(key: string): void
}

export const SECRET_KEYS = {
  anthropicApiKey: 'anthropic.apiKey'
} as const

export class SafeStorageSecretStore implements SecretStore {
  constructor(private readonly db: Db) {}

  private ensureAvailable(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new AppError(
        'IO',
        'El cifrado del sistema no está disponible. En Linux hace falta un llavero (GNOME Keyring o KWallet).'
      )
    }
  }

  set(key: string, value: string): void {
    this.ensureAvailable()
    const ciphertext = safeStorage.encryptString(value).toString('base64')
    const now = nowIso()
    this.db
      .insert(secrets)
      .values({ key, ciphertext, updatedAt: now })
      .onConflictDoUpdate({ target: secrets.key, set: { ciphertext, updatedAt: now } })
      .run()
  }

  get(key: string): string | null {
    const row = this.db.select().from(secrets).where(eq(secrets.key, key)).get()
    if (!row) return null
    this.ensureAvailable()
    try {
      return safeStorage.decryptString(Buffer.from(row.ciphertext, 'base64'))
    } catch {
      // Cifrado con otra cuenta de usuario o máquina: se considera inexistente.
      throw new AppError('IO', 'No se pudo descifrar el secreto guardado. Vuelve a introducirlo.')
    }
  }

  has(key: string): boolean {
    return !!this.db.select({ key: secrets.key }).from(secrets).where(eq(secrets.key, key)).get()
  }

  delete(key: string): void {
    this.db.delete(secrets).where(eq(secrets.key, key)).run()
  }
}

/** Para tests. */
export class InMemorySecretStore implements SecretStore {
  private map = new Map<string, string>()
  set(key: string, value: string): void {
    this.map.set(key, value)
  }
  get(key: string): string | null {
    return this.map.get(key) ?? null
  }
  has(key: string): boolean {
    return this.map.has(key)
  }
  delete(key: string): void {
    this.map.delete(key)
  }
}
