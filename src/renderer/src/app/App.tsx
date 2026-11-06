import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { onEvent } from '@renderer/lib/events'
import { usePublishingEvents } from '@renderer/features/publishing/usePublishing'
import { router } from './router'
import { ThemeSync } from './ThemeSync'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Los datos vienen de la propia máquina: no hace falta refrescar al volver a la ventana.
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000
    }
  }
})

/** Escucha eventos globales del proceso principal (navegación desde avisos, cola de publicación). */
function GlobalEvents(): null {
  usePublishingEvents()
  React.useEffect(() => onEvent('app:navigate', ({ to }) => void router.navigate(to)), [])
  return null
}

export function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <ThemeSync />
        <GlobalEvents />
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
