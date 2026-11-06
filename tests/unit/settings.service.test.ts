import { describe, expect, it, vi } from 'vitest'
import { SettingsService } from '@main/services/settings.service'
import { InMemorySettingsRepository } from '@main/repositories/settings.repository'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'

function makeService(seed?: Record<string, unknown>): {
  repo: InMemorySettingsRepository
  service: SettingsService
} {
  const repo = new InMemorySettingsRepository()
  if (seed) for (const [key, value] of Object.entries(seed)) repo.write(key, value)
  return { repo, service: new SettingsService(repo) }
}

describe('SettingsService', () => {
  it('devuelve los valores por defecto con el almacén vacío', () => {
    const { service } = makeService()
    expect(service.get()).toEqual(DEFAULT_SETTINGS)
  })

  it('rellena las claves que faltan en una sección parcial', () => {
    const { service } = makeService({ appearance: { theme: 'dark' } })
    const settings = service.get()
    expect(settings.appearance.theme).toBe('dark')
    expect(settings.appearance.reduceMotion).toBe('system')
    expect(settings.general).toEqual(DEFAULT_SETTINGS.general)
  })

  it('recupera una sección corrupta sin perder las demás', () => {
    const { service } = makeService({
      appearance: { theme: 'morado' }, // valor inválido
      general: { language: 'en', keepRunningInTray: false }
    })
    const settings = service.get()
    expect(settings.appearance).toEqual(DEFAULT_SETTINGS.appearance)
    expect(settings.general.language).toBe('en')
    expect(settings.general.keepRunningInTray).toBe(false)
  })

  it('aplica un parche y solo escribe las secciones tocadas', () => {
    const { repo, service } = makeService()
    const writeSpy = vi.spyOn(repo, 'write')
    const next = service.update({ appearance: { theme: 'light' } })
    expect(next.appearance.theme).toBe('light')
    expect(next.general).toEqual(DEFAULT_SETTINGS.general)
    expect(writeSpy).toHaveBeenCalledTimes(1)
    expect(writeSpy).toHaveBeenCalledWith('appearance', next.appearance)
  })

  it('persiste entre instancias que comparten repositorio', () => {
    const repo = new InMemorySettingsRepository()
    new SettingsService(repo).update({ general: { language: 'en' } })
    expect(new SettingsService(repo).get().general.language).toBe('en')
  })

  it('avisa a los oyentes al cambiar y permite darse de baja', () => {
    const { service } = makeService()
    const listener = vi.fn()
    const off = service.onChange(listener)
    service.update({ appearance: { theme: 'dark' } })
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    service.update({ appearance: { theme: 'light' } })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reset vuelve a los valores por defecto', () => {
    const { service } = makeService({ appearance: { theme: 'dark' } })
    expect(service.get().appearance.theme).toBe('dark')
    expect(service.reset()).toEqual(DEFAULT_SETTINGS)
  })
})
