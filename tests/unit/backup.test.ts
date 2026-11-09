/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BACKUP_FOLDER,
  DB_FILE,
  KEEP_AUTO_SNAPSHOTS,
  PENDING_DB,
  applyPendingRestore,
  createBackup,
  listSnapshots,
  snapshotName,
  stageRestore,
  type BackupDeps
} from '@main/backup/backup'
import { BackupService } from '@main/services/backup.service'
import { SettingsService } from '@main/services/settings.service'
import { applySettingsPatch, DEFAULT_SETTINGS, type Settings } from '@shared/domain/settings'

let base: string
let dataDir: string
let mediaDir: string
let dest: string
let clock = new Date(2026, 10, 9, 15, 30)

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'rrss-backup-'))
  dataDir = join(base, 'data')
  mediaDir = join(dataDir, 'media')
  dest = join(base, 'destino')
  mkdirSync(mediaDir, { recursive: true })
  mkdirSync(dest)
  writeFileSync(join(mediaDir, 'a.jpg'), 'aaaa')
  writeFileSync(join(mediaDir, 'b.mp4'), 'bbbbbbbb')
  writeFileSync(join(dataDir, DB_FILE), 'BD actual')
  clock = new Date(2026, 10, 9, 15, 30)
})
afterEach(() => rmSync(base, { recursive: true, force: true }))

const deps = (over: Partial<BackupDeps> = {}): BackupDeps => ({
  dataDir,
  mediaDir,
  appVersion: '1.0.0',
  schemaVersion: 6,
  dumpDatabase: async (file) => writeFileSync(file, 'copia de la BD'),
  now: () => clock,
  ...over
})

describe('createBackup', () => {
  it('guarda la base de datos, el manifest y los medios', async () => {
    const result = await createBackup(deps(), dest, { auto: false })
    const root = join(dest, BACKUP_FOLDER)
    expect(result.snapshot).toBe('2026-11-09 1530')
    expect(readFileSync(join(root, result.snapshot, DB_FILE), 'utf8')).toBe('copia de la BD')
    expect(readFileSync(join(root, 'media', 'a.jpg'), 'utf8')).toBe('aaaa')
    const manifest = JSON.parse(readFileSync(join(root, result.snapshot, 'manifest.json'), 'utf8'))
    expect(manifest).toMatchObject({
      schemaVersion: 6,
      appVersion: '1.0.0',
      auto: false,
      mediaFiles: 2
    })
    expect(result.mediaCopied).toBe(2)
  })

  it('en la segunda copia solo añade los medios nuevos', async () => {
    await createBackup(deps(), dest, { auto: false })
    writeFileSync(join(mediaDir, 'c.png'), 'cc')
    clock = new Date(2026, 10, 9, 15, 31)
    const second = await createBackup(deps(), dest, { auto: false })
    expect(second.mediaCopied).toBe(1)
    expect(second.mediaBytes).toBe(2)
  })

  it('no sobrescribe una copia hecha en el mismo minuto', async () => {
    const first = await createBackup(deps(), dest, { auto: false })
    const second = await createBackup(deps(), dest, { auto: false })
    expect(second.snapshot).toBe(`${first.snapshot} (2)`)
  })

  it('no borra de la copia los medios que ya no existen en la app', async () => {
    await createBackup(deps(), dest, { auto: false })
    rmSync(join(mediaDir, 'a.jpg'))
    clock = new Date(2026, 10, 9, 15, 32)
    await createBackup(deps(), dest, { auto: false })
    expect(existsSync(join(dest, BACKUP_FOLDER, 'media', 'a.jpg'))).toBe(true)
  })

  it('rechaza guardar dentro de la propia carpeta de datos', async () => {
    await expect(
      createBackup(deps(), join(dataDir, 'copias'), { auto: false })
    ).rejects.toMatchObject({
      code: 'VALIDATION'
    })
  })

  it('conserva solo las últimas copias automáticas y nunca borra las manuales', async () => {
    await createBackup(deps(), dest, { auto: false })
    for (let i = 1; i <= KEEP_AUTO_SNAPSHOTS + 3; i++) {
      clock = new Date(2026, 10, 9, 16, i)
      await createBackup(deps(), dest, { auto: true })
    }
    const snapshots = await listSnapshots(dest, 6)
    expect(snapshots.filter((s) => s.auto)).toHaveLength(KEEP_AUTO_SNAPSHOTS)
    expect(snapshots.filter((s) => !s.auto)).toHaveLength(1)
  })
})

describe('listSnapshots', () => {
  it('ordena de más reciente a más antigua y marca las incompatibles', async () => {
    await createBackup(deps({ schemaVersion: 6 }), dest, { auto: false })
    clock = new Date(2026, 10, 10, 9, 0)
    await createBackup(deps({ schemaVersion: 9, appVersion: '2.0.0' }), dest, { auto: false })
    const list = await listSnapshots(dest, 6)
    expect(list.map((s) => s.name)).toEqual(['2026-11-10 0900', '2026-11-09 1530'])
    expect(list[0]).toMatchObject({ compatible: false })
    expect(list[0]?.reason).toMatch(/más nueva/)
    expect(list[1]).toMatchObject({ compatible: true, reason: null })
  })

  it('acepta tanto la carpeta de destino como la propia carpeta de copias', async () => {
    await createBackup(deps(), dest, { auto: false })
    expect(await listSnapshots(join(dest, BACKUP_FOLDER), 6)).toHaveLength(1)
  })

  it('devuelve una lista vacía si la carpeta no tiene copias', async () => {
    expect(await listSnapshots(join(base, 'nada'), 6)).toEqual([])
  })
})

describe('restauración', () => {
  it('añade los medios que faltan sin borrar los actuales y deja la base preparada', async () => {
    const made = await createBackup(deps(), dest, { auto: false })
    rmSync(join(mediaDir, 'a.jpg'))
    writeFileSync(join(mediaDir, 'nuevo.png'), 'n')
    const staged = await stageRestore({ dataDir, mediaDir, schemaVersion: 6 }, dest, made.snapshot)
    expect(staged.mediaCopied).toBe(1)
    expect(existsSync(join(mediaDir, 'a.jpg'))).toBe(true)
    expect(existsSync(join(mediaDir, 'nuevo.png'))).toBe(true)
    expect(readFileSync(join(dataDir, PENDING_DB), 'utf8')).toBe('copia de la BD')
    expect(readFileSync(join(dataDir, DB_FILE), 'utf8')).toBe('BD actual') // la BD abierta no se toca
  })

  it('rechaza una copia de una versión más nueva y una carpeta que no es una copia', async () => {
    await createBackup(deps({ schemaVersion: 9 }), dest, { auto: false })
    await expect(
      stageRestore({ dataDir, mediaDir, schemaVersion: 6 }, dest, '2026-11-09 1530')
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(
      stageRestore({ dataDir, mediaDir, schemaVersion: 6 }, dest, 'no-existe')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('al arrancar aparta la base actual, conserva las claves y pone la de la copia', async () => {
    const made = await createBackup(deps(), dest, { auto: false })
    await stageRestore({ dataDir, mediaDir, schemaVersion: 6 }, dest, made.snapshot)
    const merge = vi.fn()
    const safety = await applyPendingRestore(dataDir, merge, clock)
    expect(readFileSync(join(dataDir, DB_FILE), 'utf8')).toBe('copia de la BD')
    expect(existsSync(join(dataDir, PENDING_DB))).toBe(false)
    expect(readFileSync(join(safety!, DB_FILE), 'utf8')).toBe('BD actual')
    expect(merge).toHaveBeenCalledWith(join(dataDir, PENDING_DB), join(safety!, DB_FILE))
  })

  it('si falla la fusión de claves, la restauración sigue adelante', async () => {
    const made = await createBackup(deps(), dest, { auto: false })
    await stageRestore({ dataDir, mediaDir, schemaVersion: 6 }, dest, made.snapshot)
    await applyPendingRestore(dataDir, () => {
      throw new Error('boom')
    })
    expect(readFileSync(join(dataDir, DB_FILE), 'utf8')).toBe('copia de la BD')
  })

  it('sin restauración pendiente no hace nada', async () => {
    expect(await applyPendingRestore(dataDir, vi.fn())).toBeNull()
    expect(readFileSync(join(dataDir, DB_FILE), 'utf8')).toBe('BD actual')
  })
})

describe('snapshotName', () => {
  it('usa hora local sin caracteres prohibidos en Windows', () => {
    expect(snapshotName(new Date(2026, 0, 5, 7, 4))).toBe('2026-01-05 0704')
  })
})

describe('BackupService', () => {
  class MemorySettings {
    value: Settings = DEFAULT_SETTINGS
    get() {
      return this.value
    }
    update(patch: Parameters<typeof applySettingsPatch>[1]) {
      this.value = applySettingsPatch(this.value, patch)
      return this.value
    }
  }

  function setup(general: Partial<Settings['general']> = {}) {
    const settings = new MemorySettings()
    settings.update({ general })
    const backup = vi.fn(async (_dir: string, auto: boolean) => ({
      root: 'r',
      snapshot: auto ? 'auto' : 'manual',
      manifest: {} as never,
      mediaCopied: 0,
      mediaBytes: 0
    }))
    const service = new BackupService({ settings: settings as unknown as SettingsService, backup })
    return { service, settings, backup }
  }

  it('sin carpeta elegida pide configurarla', async () => {
    const { service } = setup()
    await expect(service.runNow()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
  })

  it('al copiar guarda la fecha de la última copia', async () => {
    const { service, settings } = setup({ backupDir: 'X' })
    await service.runNow(false, new Date('2026-11-09T10:00:00.000Z'))
    expect(settings.get().general.lastBackupAt).toBe('2026-11-09T10:00:00.000Z')
  })

  it('la copia automática solo se hace cuando toca', async () => {
    const { service, backup } = setup({
      backupDir: 'X',
      backupEveryDays: 7,
      lastBackupAt: '2026-11-05T10:00:00.000Z'
    })
    expect(await service.runIfDue(new Date('2026-11-08T10:00:00.000Z'))).toBe(false)
    expect(await service.runIfDue(new Date('2026-11-12T10:00:00.000Z'))).toBe(true)
    expect(backup).toHaveBeenCalledTimes(1)
    expect(backup.mock.calls[0]![1]).toBe(true)
  })

  it('con 0 días o sin carpeta no hace copias automáticas', async () => {
    expect(await setup({ backupDir: 'X', backupEveryDays: 0 }).service.runIfDue()).toBe(false)
    expect(await setup({ backupDir: '', backupEveryDays: 7 }).service.runIfDue()).toBe(false)
  })

  it('un fallo de la copia automática no rompe nada y queda anotado', async () => {
    const { service, backup } = setup({ backupDir: 'X', backupEveryDays: 1 })
    backup.mockRejectedValueOnce(new Error('disco lleno'))
    expect(await service.runIfDue(new Date('2030-01-01T00:00:00.000Z'))).toBe(false)
    expect(service.status().lastError).toMatch(/disco lleno/)
  })
})
