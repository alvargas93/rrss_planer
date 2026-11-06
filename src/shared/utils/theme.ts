import type { ThemePreference } from '../domain/settings'

export type ResolvedTheme = 'light' | 'dark'

/**
 * Convierte la preferencia del usuario ("claro", "oscuro", "seguir al sistema")
 * en el tema que realmente se pinta. Función pura para poder probarla.
 */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}
