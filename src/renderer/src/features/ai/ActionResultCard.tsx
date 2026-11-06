import * as React from 'react'
import { useNavigate } from 'react-router'
import { addDays, nextMonday, setHours, setMinutes, startOfDay } from 'date-fns'
import { Check, Copy, Lightbulb, Plus, SquarePen } from 'lucide-react'
import {
  ActionResultSchemas,
  type ActionKind,
  type ActionResult,
  type AiMessageBlock
} from '@shared/domain/ai'
import { NETWORK_META, type Network, type PostKind, POST_KINDS } from '@shared/connectors/networks'
import { Button } from '@renderer/components/ui/button'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { useCreateIdea } from '@renderer/features/ideas/useIdeas'
import { useCreatePost } from '@renderer/features/posts/usePosts'
import { usePillars } from '@renderer/features/pillars/usePillars'
import { useComposerBridge, type ComposerInsert } from './stores'

type ActionBlock = Extract<AiMessageBlock, { type: 'action' }>

function useCopy(): [copied: string | null, copy: (key: string, text: string) => void] {
  const [copied, setCopied] = React.useState<string | null>(null)
  const copy = React.useCallback((key: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
    })
  }, [])
  return [copied, copy]
}

/** Botón que manda texto al compositor (abriéndolo si hace falta). */
function InsertButton({
  insert,
  label
}: {
  insert: ComposerInsert
  label: string
}): React.JSX.Element {
  const navigate = useNavigate()
  const push = useComposerBridge((s) => s.push)
  const mounted = useComposerBridge((s) => s.mounted)
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        push(insert)
        if (!mounted) void navigate('/compose')
      }}
    >
      <SquarePen aria-hidden /> {label}
    </Button>
  )
}

function IdeasCard({ result }: { result: ActionResult<'ideas'> }): React.JSX.Element {
  const create = useCreateIdea()
  const { data: pillars = [] } = usePillars()
  const [saved, setSaved] = React.useState<Set<number>>(new Set())
  return (
    <ol className="flex flex-col gap-2">
      {result.ideas.map((idea, i) => {
        const pillar = pillars.find((p) => p.name.toLowerCase() === idea.pillar?.toLowerCase())
        return (
          <li key={i} className="rounded-md border border-border bg-surface p-3">
            <p className="text-sm font-semibold">{idea.title}</p>
            <p className="mt-1 text-sm italic">«{idea.hook}»</p>
            <p className="mt-1 text-xs text-muted">{idea.angle}</p>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-subtle">
              <span>{idea.format}</span>
              {idea.pillar && <span>· {idea.pillar}</span>}
              <Button
                size="sm"
                variant={saved.has(i) ? 'secondary' : 'outline'}
                className="ml-auto h-7"
                disabled={saved.has(i) || create.isPending}
                onClick={() =>
                  create.mutate(
                    {
                      title: idea.title,
                      notes: `${idea.hook}\n\n${idea.angle}\n\nFormato: ${idea.format}`,
                      pillarId: pillar?.id ?? null,
                      source: 'Asistente'
                    },
                    { onSuccess: () => setSaved((s) => new Set(s).add(i)) }
                  )
                }
              >
                {saved.has(i) ? <Check aria-hidden /> : <Lightbulb aria-hidden />}
                {saved.has(i) ? 'Guardada' : 'Guardar idea'}
              </Button>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function ScriptCard({ result }: { result: ActionResult<'script'> }): React.JSX.Element {
  const [copied, copy] = useCopy()
  const full = `${result.hook}\n\n${result.body}\n\n${result.cta}`
  return (
    <div className="flex flex-col gap-3">
      <section>
        <p className="text-[11px] font-semibold text-subtle uppercase">Gancho</p>
        <p className="text-sm font-medium">{result.hook}</p>
      </section>
      <section>
        <p className="text-[11px] font-semibold text-subtle uppercase">Desarrollo</p>
        <p className="text-sm whitespace-pre-line">{result.body}</p>
      </section>
      <section>
        <p className="text-[11px] font-semibold text-subtle uppercase">Llamada a la acción</p>
        <p className="text-sm">{result.cta}</p>
      </section>
      {result.onScreenText.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold text-subtle uppercase">Rótulos en pantalla</p>
          <ol className="list-decimal pl-5 text-sm">
            {result.onScreenText.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </section>
      )}
      <p className="text-xs text-muted">≈ {result.estimatedSeconds} s leído en voz alta</p>
      <div className="flex flex-wrap gap-2">
        <InsertButton insert={{ kind: 'body', text: full }} label="Usar como texto base" />
        <Button size="sm" variant="ghost" onClick={() => copy('script', full)}>
          {copied === 'script' ? <Check aria-hidden /> : <Copy aria-hidden />} Copiar
        </Button>
      </div>
    </div>
  )
}

function AdaptCard({ result }: { result: ActionResult<'adapt'> }): React.JSX.Element {
  const [copied, copy] = useCopy()
  return (
    <div className="flex flex-col gap-3">
      {result.adaptations.map((a) => (
        <section key={a.network} className="rounded-md border border-border bg-surface p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{NETWORK_META[a.network].label}</p>
            <span className="text-[11px] text-subtle">
              {a.text.length} / {NETWORK_META[a.network].maxChars}
            </span>
          </div>
          <p className="mt-1 text-sm whitespace-pre-line">{a.text}</p>
          <p className="mt-1 text-xs text-muted">{a.notes}</p>
          <div className="mt-2 flex gap-2">
            <InsertButton
              insert={{ kind: 'variant', network: a.network, text: a.text }}
              label={`Aplicar a ${NETWORK_META[a.network].label}`}
            />
            <Button size="sm" variant="ghost" onClick={() => copy(a.network, a.text)}>
              {copied === a.network ? <Check aria-hidden /> : <Copy aria-hidden />} Copiar
            </Button>
          </div>
        </section>
      ))}
    </div>
  )
}

function HashtagsCard({ result }: { result: ActionResult<'hashtags'> }): React.JSX.Element {
  const [copied, copy] = useCopy()
  const line = result.hashtags.join(' ')
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm leading-7 break-words">{line}</p>
      <p className="text-xs text-muted">{result.rationale}</p>
      <div className="flex gap-2">
        <InsertButton
          insert={{ kind: 'appendBody', text: `\n\n${line}` }}
          label="Añadir al texto base"
        />
        <Button size="sm" variant="ghost" onClick={() => copy('tags', line)}>
          {copied === 'tags' ? <Check aria-hidden /> : <Copy aria-hidden />} Copiar
        </Button>
      </div>
    </div>
  )
}

function WeeklyPlanCard({ result }: { result: ActionResult<'weekly_plan'> }): React.JSX.Element {
  const create = useCreatePost()
  const { data: pillars = [] } = usePillars()
  const [confirm, setConfirm] = React.useState(false)
  const [created, setCreated] = React.useState(false)
  const monday = startOfDay(nextMonday(new Date()))
  const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  const slotDate = (slot: ActionResult<'weekly_plan'>['slots'][number]): Date => {
    const [h = 10, m = 0] = slot.time.split(':').map(Number)
    return setMinutes(setHours(addDays(monday, slot.dayOffset), h), m)
  }

  const createAll = async (): Promise<void> => {
    for (const slot of result.slots) {
      const kind = (POST_KINDS as readonly string[]).includes(slot.kind)
        ? (slot.kind as PostKind)
        : NETWORK_META[slot.network].defaultKind
      const pillar = pillars.find((p) => p.name.toLowerCase() === slot.pillar?.toLowerCase())
      await create.mutateAsync({
        title: slot.title,
        body: slot.outline,
        pillarId: pillar?.id ?? null,
        notes: 'Creado desde el plan semanal del asistente',
        scheduledAt: slotDate(slot).toISOString(),
        variants: [{ network: slot.network, kind, text: slot.outline, extra: {} }],
        mediaIds: []
      })
    }
    setCreated(true)
    setConfirm(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">{result.summary}</p>
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface">
        {result.slots.map((slot, i) => (
          <li key={i} className="flex gap-3 p-2.5 text-sm">
            <span className="w-16 shrink-0 text-xs font-semibold text-muted">
              {days[slot.dayOffset]} {slot.time}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{slot.title}</span>
              <span className="block text-xs text-muted">{slot.outline}</span>
              <span className="block text-[11px] text-subtle">
                {NETWORK_META[slot.network].label} · {slot.kind}
                {slot.pillar && ` · ${slot.pillar}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div>
        <Button
          size="sm"
          variant={created ? 'secondary' : 'outline'}
          disabled={created}
          onClick={() => setConfirm(true)}
        >
          {created ? <Check aria-hidden /> : <Plus aria-hidden />}
          {created
            ? 'Borradores creados'
            : `Crear ${result.slots.length} borradores en el calendario`}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="¿Crear estos borradores?"
        description={`Se añadirán ${result.slots.length} borradores programados la semana que viene (desde el ${monday.toLocaleDateString('es-ES')}). No se publica nada.`}
        confirmLabel="Crear borradores"
        pending={create.isPending}
        onConfirm={() => void createAll()}
      />
    </div>
  )
}

/** Dibuja el resultado de una acción con sus botones de aplicar. Valida antes de pintar. */
export function ActionResultCard({ block }: { block: ActionBlock }): React.JSX.Element {
  const kind: ActionKind = block.kind
  const parsed = ActionResultSchemas[kind].safeParse(block.result)
  if (!parsed.success) {
    return <p className="text-sm text-warning">El resultado guardado no se pudo interpretar.</p>
  }
  switch (kind) {
    case 'ideas':
      return <IdeasCard result={parsed.data as ActionResult<'ideas'>} />
    case 'script':
      return <ScriptCard result={parsed.data as ActionResult<'script'>} />
    case 'adapt':
      return <AdaptCard result={parsed.data as ActionResult<'adapt'>} />
    case 'hashtags':
      return <HashtagsCard result={parsed.data as ActionResult<'hashtags'>} />
    case 'weekly_plan':
      return <WeeklyPlanCard result={parsed.data as ActionResult<'weekly_plan'>} />
  }
}

export type { Network }
