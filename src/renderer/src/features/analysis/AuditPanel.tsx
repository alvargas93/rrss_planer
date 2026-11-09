import * as React from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import { NETWORK_META, kindLabel } from '@shared/connectors/networks'
import type { Analysis, Profile } from '@shared/domain/analysis'
import { Button } from '@renderer/components/ui/button'
import { Field, Textarea } from '@renderer/components/ui/input'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { fmtDateTime } from '@renderer/lib/dates'
import { cn } from '@renderer/lib/utils'
import { useAiStatus } from '@renderer/features/ai/useAi'
import { fmtUsd } from './draft'
import { useAnalyses, useAudit, useDeleteAnalysis, useSnapshots } from './useAnalysis'

type AuditAnalysis = Extract<Analysis, { kind: 'audit' }>

function List({ title, items }: { title: string; items: string[] }): React.JSX.Element | null {
  if (items.length === 0) return null
  return (
    <section>
      <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">
        {title}
      </h3>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

function AuditCard({ analysis }: { analysis: AuditAnalysis }): React.JSX.Element {
  const r = analysis.result
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <p className="text-base font-semibold">{r.headline}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <List title="Puntos fuertes" items={r.strengths} />
        <List title="Puntos débiles" items={r.weaknesses} />
      </div>
      <List
        title="Formatos que mejor funcionan"
        items={r.bestFormats.map((f) => `${f.format}: ${f.why}`)}
      />
      <List
        title="Publicaciones que destacan"
        items={r.topPosts.map((p) => `${p.post}: ${p.why}`)}
      />
      <section>
        <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">
          Qué hacer ahora
        </h3>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {r.recommendations.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      </section>
      {r.suggestedFrequency.length > 0 && (
        <section>
          <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">
            Ritmo recomendado
          </h3>
          <ul className="flex flex-wrap gap-2 text-sm">
            {r.suggestedFrequency.map((f, i) => (
              <li key={i} className="rounded-md border border-border px-2.5 py-1">
                {NETWORK_META[f.network].label} · {kindLabel(f.network, f.kind)}:{' '}
                <strong>{f.perWeek}</strong> por semana
              </li>
            ))}
          </ul>
        </section>
      )}
      <List title="Datos que faltan para afinar" items={r.dataGaps} />
      <p className="text-xs text-subtle">
        {fmtDateTime(analysis.createdAt)} · {analysis.model} · {fmtUsd(analysis.costUsd)}
        {analysis.instruction && ` · Indicaciones: ${analysis.instruction}`}
      </p>
    </article>
  )
}

/** Pestaña «Análisis»: diagnóstico de la cuenta hecho por Claude con los datos guardados. */
export function AuditPanel({ profile }: { profile: Profile }): React.JSX.Element {
  const analyses = useAnalyses(profile.id)
  const snapshots = useSnapshots(profile.id)
  const aiStatus = useAiStatus()
  const audit = useAudit()
  const remove = useDeleteAnalysis()
  const [instruction, setInstruction] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const audits = (analyses.data ?? []).filter((a): a is AuditAnalysis => a.kind === 'audit')
  const selected = audits.find((a) => a.id === selectedId) ?? audits[0] ?? null
  const hasData = (snapshots.data?.length ?? 0) > 0
  const hasKey = aiStatus.data?.hasKey ?? false

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <Field
          label="Indicaciones (opcional)"
          htmlFor="audit-instruction"
          hint="Por ejemplo: «quiero crecer en reels» o «me interesa vender mi curso»."
        >
          <Textarea
            id="audit-instruction"
            rows={2}
            className="min-h-14"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() =>
              audit.mutate(
                { profileId: profile.id, instruction },
                { onSuccess: (a) => setSelectedId(a.id) }
              )
            }
            disabled={!hasKey || !hasData || audit.isPending}
          >
            <Sparkles aria-hidden />
            {audit.isPending ? 'Claude está analizando…' : 'Analizar con Claude'}
          </Button>
          <p className="text-xs text-muted">
            {!hasData
              ? 'Primero añade datos en la pestaña Datos.'
              : !hasKey
                ? 'Falta la clave de Claude (Ajustes → Claude).'
                : 'Usa la última lectura y la compara con la anterior si existe.'}
          </p>
        </div>
        {audit.error && (
          <p role="alert" className="text-sm text-danger">
            {audit.error.message}
          </p>
        )}
      </section>

      {analyses.isPending ? (
        <Skeleton className="h-48" />
      ) : !selected ? (
        <p className="rounded-lg border border-dashed border-border-strong px-4 py-10 text-center text-sm text-muted">
          Todavía no hay ningún análisis de esta cuenta.
        </p>
      ) : (
        <>
          {audits.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Análisis:</span>
              {audits.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={a.id === selected.id}
                  onClick={() => setSelectedId(a.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-base',
                    a.id === selected.id
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-border text-muted hover:text-text'
                  )}
                >
                  {fmtDateTime(a.createdAt)}
                </button>
              ))}
            </div>
          )}
          <AuditCard analysis={selected} />
          <div>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 aria-hidden /> Borrar este análisis
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="¿Borrar este análisis?"
        description="Desaparece de la lista. Los datos de la cuenta no se tocan."
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
