import { Outlet } from 'react-router'
import { Sidebar } from './Sidebar'
import { AccountsStrip } from '@renderer/components/AccountsStrip'
import { AssistantPanel } from '@renderer/features/ai/AssistantPanel'

export function AppLayout(): React.JSX.Element {
  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <main id="main" className="flex min-w-0 flex-1 flex-col overflow-hidden" tabIndex={-1}>
        <AccountsStrip />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-8 py-6">
            <Outlet />
          </div>
        </div>
      </main>
      <AssistantPanel />
    </div>
  )
}
