import { describe, expect, it } from 'vitest'
import { resolveTheme } from '@shared/utils/theme'
import { shouldReduceMotion } from '@shared/utils/motion'

describe('resolveTheme', () => {
  it('respeta la elección explícita', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
  it('sigue al sistema cuando se le pide', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('shouldReduceMotion', () => {
  it('sigue al sistema por defecto', () => {
    expect(shouldReduceMotion('system', true)).toBe(true)
    expect(shouldReduceMotion('system', false)).toBe(false)
  })
  it('permite forzar en ambos sentidos', () => {
    expect(shouldReduceMotion('on', false)).toBe(true)
    expect(shouldReduceMotion('off', true)).toBe(false)
  })
})
