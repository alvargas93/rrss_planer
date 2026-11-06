import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Esquema de la base de datos (Drizzle). Cada fase añade sus tablas aquí y genera
 * una migración con `npm run db:generate`. Las migraciones generadas viven en /drizzle
 * y se aplican al arrancar la app.
 *
 * Convenciones (ver docs/PLAN.md §5): ids UUID v7 en texto, fechas ISO 8601 UTC,
 * `deleted_at` para borrado lógico, JSON en columnas de texto.
 */

/** Ajustes de la app, una fila por sección (appearance, general, ai…). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at').notNull()
})

/** Secretos cifrados con safeStorage. El valor en claro nunca toca el disco. */
export const secrets = sqliteTable('secrets', {
  key: text('key').primaryKey(),
  /** Blob cifrado, codificado en base64. */
  ciphertext: text('ciphertext').notNull(),
  updatedAt: text('updated_at').notNull()
})
