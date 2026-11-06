import * as React from 'react'
import { Link } from 'react-router'
import { ArrowUp, KeyRound, Loader2, Sparkles } from 'lucide-react'
import { ACTION_KINDS, ACTION_LABELS, type ActionKind } from '@shared/domain/ai'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/input'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { cn } from '@renderer/lib/utils'
import { MessageBubble } from './MessageBubble'
import { useAiStatus, useChat, useMessages, useRunAction, useStreamingReply } from './useAi'
import { useAssistantUi, useScreenContextStore } from './stores'

const ACTION_HINT: Record<ActionKind, string> = {
  ideas: 'Usa tus pilares y lo que haya en pantalla.',
  script: 'Gancho, desarrollo y llamada a la acción a partir del texto en pantalla.',
  adapt: 'Reescribe el texto base para cada red activada.',
  hashtags: 'Para el contenido que tienes abierto.',
  weekly_plan: 'Propone la semana que viene; tú decides si crear los borradores.'
}

export function AssistantChat({ className }: { className?: string }): React.JSX.Element {
  const status = useAiStatus()
  const conversationId = useAssistantUi((s) => s.conversationId)
  const setConversationId = useAssistantUi((s) => s.setConversationId)
  const context = useScreenContextStore((s) => s.context)
  const messages = useMessages(conversationId)
  const chat = useChat()
  const runAction = useRunAction()
  const streaming = useStreamingReply()
  const [text, setText] = React.useState('')
  const listRef = React.useRef<HTMLDivElement>(null)

  const busy = chat.isPending || runAction.isPending
  const showStreaming =
    streaming && !streaming.done && (!conversationId || streaming.conversationId === conversationId)

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.data, streaming?.text])

  const send = (): void => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setText('')
    chat.mutate(
      { conversationId, text: trimmed, context },
      { onSuccess: (reply) => setConversationId(reply.conversationId) }
    )
  }

  const run = (kind: ActionKind): void => {
    if (busy) return
    const instruction = text.trim()
    setText('')
    runAction.mutate(
      { conversationId, kind, instruction, context },
      { onSuccess: (reply) => setConversationId(reply.conversationId) }
    )
  }

  const error = chat.error ?? runAction.error

  if (status.data && !status.data.hasKey) {
    return (
      <div
        className={cn('flex flex-col items-center justify-center gap-3 p-6 text-center', className)}
      >
        <span className="grid size-12 place-items-center rounded-xl bg-accent-soft text-accent">
          <KeyRound size={22} aria-hidden />
        </span>
        <p className="text-sm font-medium">Conecta tu clave de Anthropic para usar el asistente</p>
        <p className="text-xs text-muted">
          Se guarda cifrada en tu equipo. Nunca sale de la app salvo para hablar con la API.
        </p>
        <Button asChild size="sm">
          <Link to="/settings">Ir a Ajustes → Claude</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {conversationId && messages.isPending ? (
          <>
            <Skeleton className="h-12 w-2/3 self-end" />
            <Skeleton className="h-20 w-5/6" />
          </>
        ) : !conversationId || (messages.data && messages.data.length === 0) ? (
          <div className="my-auto flex flex-col items-center gap-2 text-center">
            <Sparkles size={22} className="text-accent" aria-hidden />
            <p className="text-sm font-medium">¿En qué te ayudo?</p>
            <p className="max-w-xs text-xs text-muted">
              Pregunta lo que quieras o lanza una acción. El asistente ve la pantalla en la que
              estás
              {context.post
                ? ` (la publicación «${context.post.title || 'sin título'}»)`
                : context.idea
                  ? ` (la idea «${context.idea.title}»)`
                  : ''}
              .
            </p>
          </div>
        ) : (
          messages.data?.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
        {showStreaming && <MessageBubble message={null} streamingText={streaming.text} />}
        {busy && !showStreaming && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <Loader2 size={14} className="animate-spin" aria-hidden /> Pensando…
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {error.message}
          </p>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Acciones rápidas">
          {ACTION_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              title={ACTION_HINT[kind]}
              disabled={busy}
              onClick={() => run(kind)}
              className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted transition-base hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {ACTION_LABELS[kind]}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            aria-label="Mensaje para el asistente"
            placeholder="Escribe aquí… (Enter envía, Mayús+Enter salta de línea)"
            rows={2}
            className="min-h-10 resize-none"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <Button size="icon" aria-label="Enviar" onClick={send} disabled={busy || !text.trim()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <ArrowUp aria-hidden />}
          </Button>
        </div>
        {status.data && (
          <p
            className={cn(
              'mt-2 text-[11px]',
              status.data.budget === 'warning'
                ? 'text-warning'
                : status.data.budget === 'exceeded'
                  ? 'text-danger'
                  : 'text-subtle'
            )}
          >
            Este mes: {status.data.usage.costUsd.toFixed(2)} $
            {status.data.limitUsd !== null && ` de ${status.data.limitUsd} $`} · {status.data.model}
          </p>
        )}
      </div>
    </div>
  )
}
