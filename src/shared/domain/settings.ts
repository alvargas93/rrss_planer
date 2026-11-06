import { z } from 'zod'

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
  keepRunningInTray: z.boolean().default(true)
})

export const SettingsSchema = z.object({
  appearance: AppearanceSettingsSchema.default(() => AppearanceSettingsSchema.parse({})),
  general: GeneralSettingsSchema.default(() => GeneralSettingsSchema.parse({}))
})

export type Settings = z.infer<typeof SettingsSchema>
export type SettingsSection = keyof Settings

export const SETTINGS_SECTIONS: SettingsSection[] = ['appearance', 'general']

/** Parche parcial: cualquier subconjunto de claves de cualquier sección. */
export const SettingsPatchSchema = z.object({
  appearance: AppearanceSettingsSchema.partial().optional(),
  general: GeneralSettingsSchema.partial().optional()
})
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({})

/** Mezcla un parche sobre unos ajustes existentes. No modifica el original. */
export function applySettingsPatch(current: Settings, patch: SettingsPatch): Settings {
  return SettingsSchema.parse({
    appearance: { ...current.appearance, ...(patch.appearance ?? {}) },
    general: { ...current.general, ...(patch.general ?? {}) }
  })
}
