import { createMemoryRouter } from 'react-router'
import { AppLayout } from './AppLayout'
import { DashboardPage } from '@renderer/features/dashboard/DashboardPage'
import { SettingsPage } from '@renderer/features/settings/SettingsPage'
import { PlaceholderPage } from '@renderer/features/placeholder/PlaceholderPage'
import { mainNav } from './navigation'

/**
 * Enrutador en memoria: una app de escritorio no tiene URLs reales.
 * Las secciones de fases futuras muestran una pantalla "pronto" con su fase.
 */
export const router = createMemoryRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'settings', element: <SettingsPage /> },
      ...mainNav
        .filter((item) => item.to !== '/')
        .map((item) => ({
          path: item.to.slice(1),
          element: <PlaceholderPage item={item} />
        }))
    ]
  }
])
