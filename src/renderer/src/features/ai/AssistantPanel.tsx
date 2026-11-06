import * as React from 'react'
import { Link } from 'react-router'
import { Maximize2, Plus, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { AssistantChat } from './AssistantChat'
import { useAssistantUi } from './stores'

/** Panel lateral del asistente, disponible en cualquier pantalla. */
export function AssistantPanel(): React.JSX.Element {
  const open = useAssistantUi((s) => s.open)
  const setOpen = useAssistantUi((s) => s.setOpen)
  const setConversationId = useAssistantUi((s) => s.setConversationId)

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  return (
    <aside
      aria-label="Asistente"
      aria-hidden={!open}
      className={cn(
        'fixed top-0 right-0 z-40 flex h-full w-[400px] flex-col border-l border-border bg-surface shadow-lg transition-transform duration-[var(--motion-base)] ease-[var(--ease)]',
        open ? 'translate-x-0' : 'translate-x-full'
      )}
      inert={!open}
    >
      <header className="flex h-[72px] items-center gap-2 border-b border-border px-4">
        <span className="size-2 rounded-full bg-accent-gradient" aria-hidden />
        <h2 className="text-sm font-semibold">Asistente</h2>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Nueva conversación"
            onClick={() => setConversationId(null)}
          >
            <Plus aria-hidden />
          </Button>
          <Button asChild size="icon" variant="ghost" className="size-8">
            <Link
              to="/assistant"
              aria-label="Abrir a pantalla completa"
              onClick={() => setOpen(false)}
            >
              <Maximize2 aria-hidden />
            </Link>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Cerrar asistente"
            onClick={() => setOpen(false)}
          >
            <X aria-hidden />
          </Button>
        </div>
      </header>
      {open && <AssistantChat className="flex-1" />}
    </aside>
  )
}
