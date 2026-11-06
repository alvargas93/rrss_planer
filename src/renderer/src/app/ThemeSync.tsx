import { useEffect } from 'react'
import { resolveTheme } from '@shared/utils/theme'
import { shouldReduceMotion } from '@shared/utils/motion'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { useSettings } from '@renderer/features/settings/useSettings'

const darkQuery = '(prefers-color-scheme: dark)'
const motionQuery = '(prefers-reduced-motion: reduce)'

/**
 * Aplica al <html> el tema y la preferencia de movimiento efectivos.
 * Escucha los cambios del sistema mientras la opción sea "seguir al sistema".
 */
export function ThemeSync(): null {
  const { data } = useSettings()
  const appearance = data?.appearance ?? DEFAULT_SETTINGS.appearance

  useEffect(() => {
    const root = document.documentElement
    const dark = window.matchMedia(darkQuery)
    const motion = window.matchMedia(motionQuery)

    const apply = (): void => {
      root.dataset.theme = resolveTheme(appearance.theme, dark.matches)
      root.dataset.reduceMotion = String(
        shouldReduceMotion(appearance.reduceMotion, motion.matches)
      )
    }
    apply()

    dark.addEventListener('change', apply)
    motion.addEventListener('change', apply)
    return () => {
      dark.removeEventListener('change', apply)
      motion.removeEventListener('change', apply)
    }
  }, [appearance.theme, appearance.reduceMotion])

  return null
}
