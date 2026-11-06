import * as React from 'react'
import type { ScreenContext } from '@shared/domain/ai'
import { usePillars } from '@renderer/features/pillars/usePillars'
import { useScreenContextStore } from './stores'

/**
 * Declara el contexto de la pantalla actual para el asistente.
 * Se vuelve a enviar cuando cambia el contenido (comparado como JSON).
 */
export function useScreenContext(partial: Partial<ScreenContext>): void {
  const setContext = useScreenContextStore((s) => s.setContext)
  const clearScreen = useScreenContextStore((s) => s.clearScreen)
  const { data: pillars } = usePillars()
  const pillarNames = React.useMemo(() => (pillars ?? []).map((p) => p.name), [pillars])
  const serialized = JSON.stringify(partial)

  React.useEffect(() => {
    const parsed = JSON.parse(serialized) as Partial<ScreenContext>
    setContext({ ...parsed, pillars: pillarNames })
  }, [serialized, pillarNames, setContext])

  React.useEffect(() => {
    const screen = partial.screen
    return () => {
      if (screen) clearScreen(screen)
    }
    // Solo al desmontar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
