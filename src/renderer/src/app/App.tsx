import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
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

export function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <ThemeSync />
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
