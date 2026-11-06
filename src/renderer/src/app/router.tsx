import { createMemoryRouter } from 'react-router'
import { AppLayout } from './AppLayout'
import { DashboardPage } from '@renderer/features/dashboard/DashboardPage'
import { SettingsPage } from '@renderer/features/settings/SettingsPage'
import { IdeasPage } from '@renderer/features/ideas/IdeasPage'
import { TasksPage } from '@renderer/features/tasks/TasksPage'
import { CalendarPage } from '@renderer/features/calendar/CalendarPage'
import { ComposerPage } from '@renderer/features/composer/ComposerPage'
import { AssistantPage } from '@renderer/features/ai/AssistantPage'
import { AccountsPage } from '@renderer/features/accounts/AccountsPage'
import { AnalyticsPage } from '@renderer/features/analytics/AnalyticsPage'
import { PlaceholderPage } from '@renderer/features/placeholder/PlaceholderPage'
import { CURRENT_PHASE, mainNav } from './navigation'

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
      { path: 'tasks', element: <TasksPage /> },
      { path: 'ideas', element: <IdeasPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'compose', element: <ComposerPage /> },
      { path: 'compose/:id', element: <ComposerPage /> },
      { path: 'assistant', element: <AssistantPage /> },
      { path: 'accounts', element: <AccountsPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      ...mainNav
        .filter((item) => item.phase > CURRENT_PHASE)
        .map((item) => ({
          path: item.to.slice(1),
          element: <PlaceholderPage item={item} />
        }))
    ]
  }
])
