import { describe, expect, it } from 'vitest'
import { contracts, channelNames, isChannelName } from '@shared/contracts'
import { SettingsPatchSchema, applySettingsPatch, DEFAULT_SETTINGS } from '@shared/domain/settings'

describe('contratos IPC', () => {
  it('todos los canales siguen la convención modulo:accion', () => {
    for (const name of channelNames) expect(name).toMatch(/^[a-z]+:[a-zA-Z]+$/)
  })

  it('cada canal declara entrada y salida', () => {
    for (const name of channelNames) {
      const contract = contracts[name]
      expect(contract.input).toBeDefined()
      expect(contract.output).toBeDefined()
    }
  })

  it('rechaza canales desconocidos', () => {
    expect(isChannelName('settings:get')).toBe(true)
    expect(isChannelName('fs:readFile')).toBe(false)
    expect(isChannelName(42)).toBe(false)
  })

  it('app:openExternal exige una URL válida', () => {
    const schema = contracts['app:openExternal'].input
    expect(schema.safeParse({ url: 'https://example.com' }).success).toBe(true)
    expect(schema.safeParse({ url: 'no es una url' }).success).toBe(false)
  })
})

describe('parche de ajustes', () => {
  it('acepta parches parciales y rechaza valores fuera de rango', () => {
    expect(SettingsPatchSchema.safeParse({ appearance: { theme: 'dark' } }).success).toBe(true)
    expect(SettingsPatchSchema.safeParse({ appearance: { theme: 'sepia' } }).success).toBe(false)
    expect(SettingsPatchSchema.safeParse({}).success).toBe(true)
  })

  it('applySettingsPatch no muta el original', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, { general: { language: 'en' } })
    expect(next.general.language).toBe('en')
    expect(DEFAULT_SETTINGS.general.language).toBe('es')
  })
})
