import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import { createLogger } from '../log'

const log = createLogger('db')

export type Db = BetterSQLite3Database<typeof schema>

export interface OpenDbOptions {
  /** Ruta del fichero .db, o ':memory:' para pruebas. */
  path: string
  migrationsFolder: string
}

/**
 * Abre la base de datos, aplica los PRAGMA recomendados y ejecuta las migraciones
 * pendientes. Devuelve el cliente Drizzle tipado con el esquema.
 */
export function openDatabase(options: OpenDbOptions): {
  db: Db
  /** Conexión nativa, para la copia en caliente de las copias de seguridad. */
  sqlite: Database.Database
  close: () => void
} {
  const sqlite = new Database(options.path)
  // WAL: lecturas y escrituras concurrentes sin bloquear; más robusto ante cierres bruscos.
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')

  const db = drizzle({ client: sqlite, schema })

  log.info(`Aplicando migraciones desde ${options.migrationsFolder}`)
  migrate(db, { migrationsFolder: options.migrationsFolder })
  log.info(`Base de datos lista en ${options.path}`)

  return {
    db,
    sqlite,
    close: () => {
      sqlite.close()
    }
  }
}
