import { z } from 'zod'

export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.enum(['win32', 'darwin', 'linux']),
  isDev: z.boolean(),
  /** Carpeta donde viven la base de datos y los medios. */
  dataDir: z.string(),
  dbPath: z.string(),
  electron: z.string(),
  node: z.string()
})
export type AppInfo = z.infer<typeof AppInfoSchema>
