import {
  SETTINGS_SECTIONS,
  SettingsSchema,
  applySettingsPatch,
  type Settings,
  type SettingsPatch
} from '@shared/domain/settings'
import type { SettingsRepository } from '../repositories/settings.repository'

type Listener = (settings: Settings) => void

/**
 * Lógica de ajustes. Lee el almacén, rellena con valores por defecto lo que falte,
 * aplica parches y avisa a quien escuche (p. ej. para cambiar el tema de la ventana).
 */
export class SettingsService {
  private cache: Settings | null = null
  private listeners = new Set<Listener>()

  constructor(private readonly repo: SettingsRepository) {}

  get(): Settings {
    if (this.cache) return this.cache
    const raw = this.repo.readAll()
    // parse con defaults: si una sección falta o está corrupta, se completa.
    const parsed = SettingsSchema.safeParse(raw)
    this.cache = parsed.success ? parsed.data : this.recoverSectionBySection(raw)
    return this.cache
  }

  update(patch: SettingsPatch): Settings {
    const next = applySettingsPatch(this.get(), patch)
    for (const section of SETTINGS_SECTIONS) {
      if (patch[section] !== undefined) this.repo.write(section, next[section])
    }
    this.cache = next
    this.emit(next)
    return next
  }

  reset(): Settings {
    this.repo.clear()
    this.cache = null
    const fresh = this.get()
    this.emit(fresh)
    return fresh
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(settings: Settings): void {
    for (const listener of this.listeners) listener(settings)
  }

  /** Si el conjunto no valida, se salva cada sección por separado y el resto va a defaults. */
  private recoverSectionBySection(raw: Record<string, unknown>): Settings {
    const safe: Record<string, unknown> = {}
    for (const section of SETTINGS_SECTIONS) {
      const sectionSchema = SettingsSchema.shape[section]
      const result = sectionSchema.safeParse(raw[section])
      safe[section] = result.success ? result.data : undefined
    }
    return SettingsSchema.parse(safe)
  }
}
