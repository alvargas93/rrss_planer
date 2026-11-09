import { z } from 'zod'
import { AiSettingsSchema } from './ai'

export const ThemePreferenceSchema = z.enum(['light', 'dark', 'system'])
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>

export const LanguageSchema = z.enum(['es', 'en'])
export type Language = z.infer<typeof LanguageSchema>

export const MotionPreferenceSchema = z.enum(['system', 'on', 'off'])

/**
 * Ajustes de la app, por secciones. Cada clave tiene un valor por defecto, de modo
 * que una base de datos vacía o una versión antigua siempre produce un objeto completo.
 * Las secciones de fases futuras (ai, scheduler…) se añaden aquí cuando lleguen.
 */
export const AppearanceSettingsSchema = z.object({
  theme: ThemePreferenceSchema.default('system'),
  reduceMotion: MotionPreferenceSchema.default('system')
})

export const GeneralSettingsSchema = z.object({
  language: LanguageSchema.default('es'),
  /** Al cerrar la ventana, ¿seguir en la bandeja? Se usa desde Fase 4 (programador). */
  keepRunningInTray: z.boolean().default(true),
  /** Abrir la app al iniciar sesión en el equipo (arranca en la bandeja, sin ventana). */
  launchAtLogin: z.boolean().default(false),
  /** Carpeta donde se guardan las copias de seguridad ('' = sin elegir). */
  backupDir: z.string().default(''),
  /** Cada cuántos días se hace una copia automática; 0 = desactivadas. */
  backupEveryDays: z.number().int().min(0).max(90).default(7),
  lastBackupAt: z.string().nullable().default(null),
  /** Dirección donde se publican las versiones nuevas (p. ej. GitHub Releases). */
  updateFeedUrl: z.string().trim().default(''),
  /** Buscar versiones nuevas una vez al día. */
  autoCheckUpdates: z.boolean().default(true)
})

/** Publicación: alojamiento temporal de medios y datos públicos de las apps de cada red. */
export const PublishingSettingsSchema = z.object({
  /** none = modo manual; cloudinary = subir, publicar y borrar. */
  mediaHost: z.enum(['none', 'cloudinary']).default('none'),
  cloudinaryCloudName: z.string().trim().default(''),
  cloudinaryApiKey: z.string().trim().default(''),
  /** Instagram App ID (público); el secreto va cifrado en `secrets`. */
  instagramAppId: z.string().trim().default(''),
  /** ID de cliente (público) de las apps de YouTube, LinkedIn y X; los secretos van cifrados. */
  youtubeClientId: z.string().trim().default(''),
  linkedinClientId: z.string().trim().default(''),
  xClientId: z.string().trim().default(''),
  /** Avisos del sistema al publicar o fallar. */
  notifyOnPublish: z.boolean().default(true),
  /** Minutos de antelación del aviso en modo manual. */
  manualNoticeMinutes: z.number().int().min(0).max(1440).default(10)
})

export const SettingsSchema = z.object({
  appearance: AppearanceSettingsSchema.default(() => AppearanceSettingsSchema.parse({})),
  general: GeneralSettingsSchema.default(() => GeneralSettingsSchema.parse({})),
  ai: AiSettingsSchema.default(() => AiSettingsSchema.parse({})),
  publishing: PublishingSettingsSchema.default(() => PublishingSettingsSchema.parse({}))
})

export type Settings = z.infer<typeof SettingsSchema>
export type SettingsSection = keyof Settings

export const SETTINGS_SECTIONS: SettingsSection[] = ['appearance', 'general', 'ai', 'publishing']

/** Parche parcial: cualquier subconjunto de claves de cualquier sección. */
export const SettingsPatchSchema = z.object({
  appearance: AppearanceSettingsSchema.partial().optional(),
  general: GeneralSettingsSchema.partial().optional(),
  ai: AiSettingsSchema.partial().optional(),
  publishing: PublishingSettingsSchema.partial().optional()
})
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({})

/** Mezcla un parche sobre unos ajustes existentes. No modifica el original. */
export function applySettingsPatch(current: Settings, patch: SettingsPatch): Settings {
  return SettingsSchema.parse({
    appearance: { ...current.appearance, ...(patch.appearance ?? {}) },
    general: { ...current.general, ...(patch.general ?? {}) },
    ai: { ...current.ai, ...(patch.ai ?? {}) },
    publishing: { ...current.publishing, ...(patch.publishing ?? {}) }
  })
}
