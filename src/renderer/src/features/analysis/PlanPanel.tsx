import * as React from 'react'
import { useNavigate } from 'react-router'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarCheck, CalendarDays, Sparkles, Trash2 } from 'lucide-react'
import {
  KIND_META,
  NETWORKS,
  NETWORK_META,
  POST_KINDS,
  kindLabel,
  type Network,
  type PostKind
} from '@shared/connectors/networks'
import { nextMondayKey, planItemDate, type Analysis, type Profile } from '@shared/domain/analysis'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Field, Input, Textarea } from '@renderer/components/ui/input'
import { Segmented } from '@renderer/components/ui/segmented'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { fmtDateTime } from '@renderer/lib/dates'
import { cn } from '@renderer/lib/utils'
import { useAiStatus } from '@renderer/features/ai/useAi'
import { fmtUsd } from './draft'
import { useAnalyses, useApplyPlan, useDeleteAnalysis, usePlan } from './useAnalysis'

type PlanAnalysis = Extract<Analysis, { kind: 'plan' }>
type Weeks = '1' | '2' | '4'

function Chip({
  pressed,
  onClick,
  children
}: {
  pressed: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-sm transition-base',
        pressed
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-border text-muted hover:text-text'
      )}
    >
      {children}
    </button>
  )
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function PlanView({ analysis }: { analysis: PlanAnalysis }): React.JSX.Element {
  const navigate = useNavigate()
  const apply = useApplyPlan()
  const { items } = analysis.result
  const pendingIndexes = React.useMemo(
    () => items.map((_, i) => i).filter((i) => !analysis.applied[String(i)]),
    [items, analysis.applied]
  )
  const [checked, setChecked] = React.useState<Set<number>>(() => new Set(pendingIndexes))
  const [confirm, setConfirm] = React.useState(false)
  const [created, setCreated] = React.useState<number | null>(null)
  const totalDays = analysis.request.weeks * 7

  const selected = [...checked].filter((i) => !analysis.applied[String(i)])

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <p className="text-sm">{analysis.result.summary}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => setChecked(new Set(pendingIndexes))}>
          Marcar todas
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>
          Desmarcar todas
        </Button>
        <span className="text-xs text-muted">
          {items.length} piezas · {pendingIndexes.length} sin pasar al calendario
        </span>
      </div>
      <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
        {items.map((item, i) => {
          const applied = !!analysis.applied[String(i)]
          const date = planItemDate(
            analysis.request.startDate,
            item.dayOffset,
            item.time,
            totalDays
          )
          const id = `plan-item-${analysis.id}-${i}`
          return (
            <li key={i} className="flex gap-3 p-3">
              <input
                id={id}
                type="checkbox"
                className="mt-1 size-4 accent-[var(--color-accent)]"
                checked={applied || checked.has(i)}
                disabled={applied}
                onChange={() =>
                  setChecked((current) => {
                    const next = new Set(current)
                    if (next.has(i)) next.delete(i)
                    else next.add(i)
                    return next
                  })
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={id} className="text-sm font-semibold">
                    {item.title}
                  </label>
                  <Badge tone="neutral">
                    {NETWORK_META[item.network].label} · {kindLabel(item.network, item.kind)}
                  </Badge>
                  {item.pillar && <Badge tone="accent">{item.pillar}</Badge>}
                  {applied && (
                    <Badge tone="success">
                      <CalendarCheck size={12} aria-hidden /> En el calendario
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted capitalize">
                  {format(date, "EEEE d 'de' MMMM · HH:mm", { locale: es })}
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-muted">Gancho: </span>«{item.hook}»
                </p>
                <p className="text-sm text-muted">{item.outline}</p>
                <details className="mt-1 text-sm">
                  <summary className="cursor-pointer text-accent">Texto para publicar</summary>
                  <p className="mt-1 whitespace-pre-line">{item.caption}</p>
                </details>
                <details className="text-sm">
                  <summary className="cursor-pointer text-accent">Cómo montarla</summary>
                  <p className="mt-1 whitespace-pre-line">{item.production}</p>
                </details>
              </div>
            </li>
          )
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setConfirm(true)} disabled={selected.length === 0}>
          <CalendarDays aria-hidden /> Pasar {selected.length} al calendario
        </Button>
        {created !== null && (
          <>
            <span role="status" className="text-sm text-success">
              Se crearon {created} borradores.
            </span>
            <Button size="sm" variant="outline" onClick={() => void navigate('/calendar')}>
              Ver calendario
            </Button>
          </>
        )}
        {apply.error && (
          <p role="alert" className="text-sm text-danger">
            {apply.error.message}
          </p>
        )}
      </div>
      <p className="text-xs text-subtle">
        {fmtDateTime(analysis.createdAt)} · {analysis.model} · {fmtUsd(analysis.costUsd)}
      </p>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`¿Crear ${selected.length} borradores?`}
        description="Se añaden al calendario en su día y hora. No se publica nada: a esa hora la app te avisará y dejará el texto copiado para que lo publiques tú."
        confirmLabel="Crear borradores"
        pending={apply.isPending}
        onConfirm={() =>
          apply.mutate(
            { analysisId: analysis.id, itemIndexes: selected },
            {
              onSuccess: (result) => {
                setCreated(result.created.length)
                setConfirm(false)
              }
            }
          )
        }
      />
    </article>
  )
}

/** Pestaña «Plan»: calendario de piezas propuesto por Claude y paso a borradores. */
export function PlanPanel({ profile }: { profile: Profile }): React.JSX.Element {
  const analyses = useAnalyses(profile.id)
  const aiStatus = useAiStatus()
  const plan = usePlan()
  const remove = useDeleteAnalysis()
  const [startDate, setStartDate] = React.useState(() => nextMondayKey(new Date()))
  const [weeks, setWeeks] = React.useState<Weeks>('2')
  const [perWeek, setPerWeek] = React.useState('5')
  const [networks, setNetworks] = React.useState<Network[]>([profile.network])
  const [kinds, setKinds] = React.useState<PostKind[]>(() => [
    ...NETWORK_META[profile.network].kinds
  ])
  const [instruction, setInstruction] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const plans = (analyses.data ?? []).filter((a): a is PlanAnalysis => a.kind === 'plan')
  const selected = plans.find((a) => a.id === selectedId) ?? plans[0] ?? null
  const lastAudit = (analyses.data ?? []).find((a) => a.kind === 'audit')
  const suggested =
    lastAudit?.kind === 'audit'
      ? Math.round(lastAudit.result.suggestedFrequency.reduce((sum, f) => sum + f.perWeek, 0))
      : null
  const availableKinds = POST_KINDS.filter((k) =>
    networks.some((n) => NETWORK_META[n].kinds.includes(k))
  )
  const chosenKinds = kinds.filter((k) => availableKinds.includes(k))
  const perWeekNumber = Math.min(21, Math.max(1, Number.parseInt(perWeek, 10) || 0))
  const hasKey = aiStatus.data?.hasKey ?? false
  const canGenerate =
    hasKey && networks.length > 0 && chosenKinds.length > 0 && !!startDate && !plan.isPending

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Empieza el" htmlFor="plan-start">
            <Input
              id="plan-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <div className="flex flex-col">
            <span className="mb-1.5 text-sm font-medium" id="plan-weeks-label">
              Duración (semanas)
            </span>
            <Segmented<Weeks>
              aria-label="Duración del plan en semanas"
              value={weeks}
              onChange={setWeeks}
              options={[
                { value: '1', label: '1' },
                { value: '2', label: '2' },
                { value: '4', label: '4' }
              ]}
            />
          </div>
          <Field
            label="Piezas por semana"
            htmlFor="plan-per-week"
            hint={suggested ? `El último análisis recomienda unas ${suggested}.` : 'Entre 1 y 21.'}
          >
            <Input
              id="plan-per-week"
              type="number"
              min={1}
              max={21}
              value={perWeek}
              onChange={(e) => setPerWeek(e.target.value)}
            />
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Redes</legend>
          <div className="flex flex-wrap gap-2">
            {NETWORKS.map((n) => (
              <Chip
                key={n}
                pressed={networks.includes(n)}
                onClick={() => setNetworks((list) => toggle(list, n))}
              >
                {NETWORK_META[n].label}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Formatos</legend>
          <div className="flex flex-wrap gap-2">
            {availableKinds.map((k) => (
              <Chip
                key={k}
                pressed={kinds.includes(k)}
                onClick={() => setKinds((list) => toggle(list, k))}
              >
                {KIND_META[k].label}
              </Chip>
            ))}
          </div>
        </fieldset>
        <Field
          label="Indicaciones (opcional)"
          htmlFor="plan-instruction"
          hint="Temas, lanzamientos, fechas especiales o lo que no quieras hacer."
        >
          <Textarea
            id="plan-instruction"
            rows={2}
            className="min-h-14"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() =>
              plan.mutate(
                {
                  profileId: profile.id,
                  startDate,
                  weeks: Number(weeks) as 1 | 2 | 4,
                  networks,
                  kinds: chosenKinds,
                  perWeek: perWeekNumber,
                  instruction
                },
                { onSuccess: (a) => setSelectedId(a.id) }
              )
            }
            disabled={!canGenerate}
          >
            <Sparkles aria-hidden />
            {plan.isPending ? 'Claude está preparando el plan…' : 'Generar plan con Claude'}
          </Button>
          <p className="text-xs text-muted">
            {!hasKey
              ? 'Falta la clave de Claude (Ajustes → Claude).'
              : 'Usa los últimos datos y el último análisis de la cuenta, si los hay.'}
          </p>
        </div>
        {plan.error && (
          <p role="alert" className="text-sm text-danger">
            {plan.error.message}
          </p>
        )}
      </section>

      {analyses.isPending ? (
        <Skeleton className="h-48" />
      ) : !selected ? (
        <p className="rounded-lg border border-dashed border-border-strong px-4 py-10 text-center text-sm text-muted">
          Todavía no hay ningún plan para esta cuenta.
        </p>
      ) : (
        <>
          {plans.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Planes:</span>
              {plans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={p.id === selected.id}
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-base',
                    p.id === selected.id
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-border text-muted hover:text-text'
                  )}
                >
                  {fmtDateTime(p.createdAt)} · {p.result.items.length} piezas
                </button>
              ))}
            </div>
          )}
          <PlanView key={selected.id} analysis={selected} />
          <div>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 aria-hidden /> Borrar este plan
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="¿Borrar este plan?"
        description="Desaparece de la lista. Los borradores que ya pasaste al calendario se quedan."
        confirmLabel="Borrar"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          selected &&
          remove.mutate(
            { id: selected.id },
            {
              onSuccess: () => {
                setConfirmDelete(false)
                setSelectedId(null)
              }
            }
          )
        }
      />
    </div>
  )
}
