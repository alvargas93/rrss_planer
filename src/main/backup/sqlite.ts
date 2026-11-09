import Database from 'better-sqlite3'

/**
 * Copia consistente de la base de datos abierta (API de copia en caliente de SQLite) sin
 * las claves y tokens guardados. Se prueba con la prueba de humo porque better-sqlite3 está
 * compilado para Electron.
 */
export async function dumpWithoutSecrets(live: Database.Database, destFile: string): Promise<void> {
  await live.backup(destFile)
  const copy = new Database(destFile)
  try {
    copy.pragma('journal_mode = DELETE')
    copy.exec('DELETE FROM secrets')
    copy.exec('VACUUM')
  } finally {
    copy.close()
  }
}

const quote = (name: string): string => `"${name.replace(/"/g, '""')}"`

/** Pasa las claves y tokens de la base anterior a la restaurada (solo las columnas comunes). */
export function mergeSecrets(newDbFile: string, oldDbFile: string): void {
  const db = new Database(newDbFile)
  try {
    db.exec(`ATTACH DATABASE '${oldDbFile.replace(/'/g, "''")}' AS old`)
    const columns = (schema: string): string[] =>
      (db.prepare(`PRAGMA ${schema}.table_info(secrets)`).all() as Array<{ name: string }>).map(
        (c) => c.name
      )
    const oldColumns = new Set(columns('old'))
    const shared = columns('main')
      .filter((c) => oldColumns.has(c))
      .map(quote)
      .join(', ')
    if (shared)
      db.exec(`INSERT OR REPLACE INTO secrets (${shared}) SELECT ${shared} FROM old.secrets`)
    db.exec('DETACH DATABASE old')
  } finally {
    db.close()
  }
}
