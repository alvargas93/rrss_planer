import * as React from 'react'
import { MessageSquare, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@renderer/components/PageHeader'
import { Button } from '@renderer/components/ui/button'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { fmtRelative } from '@renderer/lib/dates'
import { cn } from '@renderer/lib/utils'
import { AssistantChat } from './AssistantChat'
import { useConversations, useDeleteConversation } from './useAi'
import { useAssistantUi } from './stores'
import { useScreenContext } from './useScreenContext'

/** Asistente a pantalla completa, con el historial de conversaciones. */
export function AssistantPage(): React.JSX.Element {
  useScreenContext({ screen: 'assistant' })
  const conversations = useConversations()
  const remove = useDeleteConversation()
  const conversationId = useAssistantUi((s) => s.conversationId)
  const setConversationId = useAssistantUi((s) => s.setConversationId)
  const [toDelete, setToDelete] = React.useState<string | null>(null)

  return (
    <>
      <PageHeader
        title="Asistente"
        description="Claude conoce tus pilares y lo que tienes en pantalla. Propone; tú decides qué aplicar."
        actions={
          <Button variant="outline" onClick={() => setConversationId(null)}>
            <Plus aria-hidden /> Nueva conversación
          </Button>
        }
      />
      <div className="grid h-[calc(100vh-220px)] min-h-[480px] grid-cols-[260px_minmax(0,1fr)] gap-4">
        <nav
          aria-label="Conversaciones"
          className="flex min-h-0 flex-col overflow-y-auto rounded-lg border border-border bg-surface"
        >
          {conversations.data && conversations.data.length === 0 && (
            <p className="p-4 text-xs text-muted">Aún no hay conversaciones.</p>
          )}
          <ul className="flex flex-col p-1.5">
            {conversations.data?.map((c) => (
              <li key={c.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => setConversationId(c.id)}
                  className={cn(
                    'flex min-w-0 flex-1 flex-col rounded-md px-2.5 py-2 text-left transition-base hover:bg-surface-2',
                    c.id === conversationId && 'bg-accent-soft'
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <MessageSquare size={14} className="shrink-0 text-subtle" aria-hidden />
                    <span className="truncate">{c.title}</span>
                  </span>
                  <span className="pl-5 text-[11px] text-subtle">{fmtRelative(c.updatedAt)}</span>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Eliminar conversación ${c.title}`}
                  onClick={() => setToDelete(c.id)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          <AssistantChat className="flex-1" />
        </div>
      </div>
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="¿Eliminar esta conversación?"
        confirmLabel="Eliminar"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (!toDelete) return
          remove.mutate(
            { id: toDelete },
            {
              onSuccess: () => {
                if (conversationId === toDelete) setConversationId(null)
                setToDelete(null)
              }
            }
          )
        }}
      />
    </>
  )
}
