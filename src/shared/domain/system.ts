import { z } from 'zod'

/** Una copia de seguridad encontrada en una carpeta. */
export const SnapshotInfoSchema = z.object({
  name: z.string(),
  createdAt: z.string(),
  appVersion: z.string(),
  schemaVersion: z.number(),
  auto: z.boolean(),
  compatible: z.boolean(),
  reason: z.string().nullable()
})
export type SnapshotInfoDto = z.infer<typeof SnapshotInfoSchema>

export const BackupStatusSchema = z.object({
  dir: z.string(),
  everyDays: z.number(),
  lastBackupAt: z.string().nullable(),
  lastError: z.string().nullable()
})

export const BackupRunResultSchema = z.object({
  snapshot: z.string(),
  mediaCopied: z.number(),
  mediaBytes: z.number()
})

export const UPDATE_STATUSES = [
  'dev',
  'not-configured',
  'idle',
  'checking',
  'none',
  'available',
  'downloading',
  'ready',
  'error'
] as const

export const UpdateStateSchema = z.object({
  status: z.enum(UPDATE_STATUSES),
  currentVersion: z.string(),
  version: z.string().nullable(),
  percent: z.number().nullable(),
  message: z.string().nullable()
})
export type UpdateStateDto = z.infer<typeof UpdateStateSchema>
