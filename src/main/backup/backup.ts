import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { AppError } from '@shared/domain/errors'

/**
 * Copias de seguridad en una carpeta normal (sin formatos propios):
 *
 *   <destino>/RRSS Planner - copias/
 *     media/                 todos los medios; solo se copia lo nuevo
 *     2026-11-09 1530/       una copia: la base de datos y su manifest.json
 *
 * Los medios van en una carpeta común y no se borran nunca, así que cada copia es rápida
 * y cualquier copia antigua sigue teniendo sus archivos. Las claves y tokens NO se copian:
 * están cifrados con la cuenta de Windows o macOS de este equipo y no servirían en otro.
 */
export const BACKUP_FOLDER = 'RRSS Planner - copias'
export const DB_FILE = 'rrss-planner.db'
export const PENDING_DB = 'restore-pending.db'
export const MANIFEST_FILE = 'manifest.json'
export const FORMAT_VERSION = 1
/** Copias automáticas que se conservan; las manuales no se borran nunca. */
export const KEEP_AUTO_SNAPSHOTS = 8

export interface BackupManifest {
  format: number
  createdAt: string
  appVersion: string
  schemaVersion: number
  auto: boolean
  mediaFiles: number
}

export interface SnapshotInfo {
  name: string
  createdAt: string
  appVersion: string
  schemaVersion: number
  auto: boolean
  compatible: boolean
  /** Por qué no se puede restaurar, si no es compatible. */
  reason: string | null
}

export interface BackupDeps {
  dataDir: string
  mediaDir: string
  appVersion: string
  /** Número de migraciones de esta versión de la app. */
  schemaVersion: number
  /** Copia consistente de la base de datos abierta, sin claves ni tokens. */
  dumpDatabase: (destFile: string) => Promise<void>
  now?: () => Date
}

export interface BackupResult {
  root: string
  snapshot: string
  manifest: BackupManifest
  mediaCopied: number
  mediaBytes: number
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Nombre de la copia en hora local, sin caracteres que Windows no admite. */
export function snapshotName(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}${pad(date.getMinutes())}`
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

async function listFiles(dir: string, base = dir): Promise<string[]> {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)))
    else if (entry.isFile()) out.push(relative(base, full))
  }
  return out
}

/** Copia solo lo que falta o ha cambiado de tamaño. Nunca borra nada en el destino. */
export async function syncFiles(
  from: string,
  to: string
): Promise<{ copied: number; bytes: number; total: number }> {
  const files = await listFiles(from)
  let copied = 0
  let bytes = 0
  for (const file of files) {
    const source = join(from, file)
    const target = join(to, file)
    const size = (await stat(source)).size
    if (existsSync(target) && (await stat(target)).size === size) continue
    await mkdir(join(target, '..'), { recursive: true })
    await copyFile(source, target)
    copied++
    bytes += size
  }
  return { copied, bytes, total: files.length }
}

export function resolveRoot(dir: string): string {
  return basename(dir) === BACKUP_FOLDER ? dir : join(dir, BACKUP_FOLDER)
}

export async function createBackup(
  deps: BackupDeps,
  destDir: string,
  options: { auto: boolean }
): Promise<BackupResult> {
  if (isInside(deps.dataDir, destDir)) {
    throw new AppError(
      'VALIDATION',
      'La carpeta de copias no puede estar dentro de la carpeta de datos de la app. Elige otra, por ejemplo en un disco externo o en la nube.'
    )
  }
  const root = resolveRoot(destDir)
  const date = (deps.now ?? ((): Date => new Date()))()
  try {
    await mkdir(join(root, 'media'), { recursive: true })
    // Primero los medios y después la base de datos: la copia nunca apunta a archivos que falten.
    const media = await syncFiles(deps.mediaDir, join(root, 'media'))
    let name = snapshotName(date)
    for (let n = 2; existsSync(join(root, name)); n++) name = `${snapshotName(date)} (${n})`
    const snapshotDir = join(root, name)
    await mkdir(snapshotDir)
    await deps.dumpDatabase(join(snapshotDir, DB_FILE))
    const manifest: BackupManifest = {
      format: FORMAT_VERSION,
      createdAt: date.toISOString(),
      appVersion: deps.appVersion,
      schemaVersion: deps.schemaVersion,
      auto: options.auto,
      mediaFiles: media.total
    }
    await writeFile(join(snapshotDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2), 'utf8')
    await pruneAuto(root)
    return { root, snapshot: name, manifest, mediaCopied: media.copied, mediaBytes: media.bytes }
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(
      'IO',
      `No se pudo guardar la copia en "${destDir}": ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

async function readSnapshot(
  root: string,
  name: string,
  currentSchema: number
): Promise<SnapshotInfo | null> {
  try {
    const manifest = JSON.parse(
      await readFile(join(root, name, MANIFEST_FILE), 'utf8')
    ) as BackupManifest
    let reason: string | null = null
    if (manifest.format !== FORMAT_VERSION) reason = 'Formato de copia desconocido.'
    else if (!existsSync(join(root, name, DB_FILE))) reason = 'Falta la base de datos en la copia.'
    else if (manifest.schemaVersion > currentSchema) {
      reason = `Es de una versión más nueva de la app (${manifest.appVersion}). Actualiza la app para restaurarla.`
    }
    return {
      name,
      createdAt: manifest.createdAt,
      appVersion: manifest.appVersion,
      schemaVersion: manifest.schemaVersion,
      auto: manifest.auto,
      compatible: reason === null,
      reason
    }
  } catch {
    return null
  }
}

/** Copias que hay en una carpeta, de la más reciente a la más antigua. */
export async function listSnapshots(dir: string, currentSchema: number): Promise<SnapshotInfo[]> {
  const root = resolveRoot(dir)
  if (!existsSync(root)) return []
  const found: SnapshotInfo[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'media') continue
    const info = await readSnapshot(root, entry.name, currentSchema)
    if (info) found.push(info)
  }
  return found.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

async function pruneAuto(root: string): Promise<void> {
  const autos = (await listSnapshots(root, Number.MAX_SAFE_INTEGER)).filter((s) => s.auto)
  for (const old of autos.slice(KEEP_AUTO_SNAPSHOTS)) {
    await rm(join(root, old.name), { recursive: true, force: true })
  }
}

export interface RestoreDeps {
  dataDir: string
  mediaDir: string
  schemaVersion: number
}

/**
 * Prepara una restauración sin tocar la base de datos abierta: añade los medios que falten
 * (sin borrar ninguno) y deja la base de datos de la copia a un lado. El cambio se aplica
 * al reiniciar la app, antes de abrirla (`applyPendingRestore`).
 */
export async function stageRestore(
  deps: RestoreDeps,
  dir: string,
  snapshot: string
): Promise<{ mediaCopied: number }> {
  const root = resolveRoot(dir)
  const info = await readSnapshot(root, snapshot, deps.schemaVersion)
  if (!info)
    throw new AppError('NOT_FOUND', 'Esa carpeta no contiene una copia válida de RRSS Planner.')
  if (!info.compatible)
    throw new AppError('VALIDATION', info.reason ?? 'La copia no es compatible.')
  const media = await syncFiles(join(root, 'media'), deps.mediaDir)
  await copyFile(join(root, snapshot, DB_FILE), join(deps.dataDir, PENDING_DB))
  return { mediaCopied: media.copied }
}

/**
 * Se llama al arrancar, antes de abrir la base de datos. Si hay una restauración preparada,
 * aparta la base actual (nunca se borra: queda en `antes-de-restaurar-…`), conserva las claves
 * de este equipo y deja en su lugar la de la copia. Devuelve la carpeta de seguridad.
 */
export async function applyPendingRestore(
  dataDir: string,
  mergeSecrets: (newDb: string, oldDb: string) => void,
  now = new Date()
): Promise<string | null> {
  const pending = join(dataDir, PENDING_DB)
  if (!existsSync(pending)) return null
  const db = join(dataDir, DB_FILE)
  const safety = join(dataDir, `antes-de-restaurar-${snapshotName(now).replace(' ', '-')}`)
  await mkdir(safety, { recursive: true })
  const hadDb = existsSync(db)
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(db + suffix)) await rename(db + suffix, join(safety, DB_FILE + suffix))
  }
  if (hadDb) {
    try {
      mergeSecrets(pending, join(safety, DB_FILE))
    } catch {
      // Sin claves restauradas: el usuario tendrá que volver a introducirlas. Los datos siguen a salvo.
    }
  }
  await rename(pending, db)
  return safety
}
