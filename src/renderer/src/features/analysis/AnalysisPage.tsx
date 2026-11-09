import * as React from 'react'
import { BarChart3, CalendarRange, Database, Pencil, Plus, ScanSearch, Trash2 } from 'lucide-react'
import { NETWORK_META } from '@shared/connectors/networks'
import type { Profile } from '@shared/domain/analysis'
import { PageHeader } from '@renderer/components/PageHeader'
import { EmptyState } from '@renderer/components/EmptyState'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Segmented } from '@renderer/components/ui/segmented'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { cn } from '@renderer/lib/utils'
import { useScreenContext } from '@renderer/features/ai/useScreenContext'
import { AuditPanel } from './AuditPanel'
import { DataPanel } from './DataPanel'
import { PlanPanel } from './PlanPanel'
import { ProfileDialog } from './ProfileDialog'
import { useDeleteProfile, useProfiles } from './useAnalysis'

type Tab = 'data' | 'audit' | 'plan'

/** Fase 9: analizar una cuenta, generar un plan y pasarlo al calendario (ADR 0002). */
export function AnalysisPage(): React.JSX.Element {
  useScreenContext({ screen: 'analysis' })
  const profiles = useProfiles()
  const remove = useDeleteProfile()
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [dialog, setDialog] = React.useState<{ profile: Profile | null } | null>(null)
  const [tab, setTab] = React.useState<Tab>('data')
  const [toDelete, setToDelete] = React.useState<Profile | null>(null)

  const list = profiles.data ?? []
  const selected = list.find((p) => p.id === selectedId) ?? list[0] ?? null

  const addButton = (
    <Button onClick={() => setDialog({ profile: null })}>
      <Plus aria-hidden /> Añadir cuenta
    </Button>
  )

  return (
    <>
      <PageHeader
        title="Análisis"
        description="Elige una cuenta, dale datos (capturas, a mano o automáticos) y Claude te propone un análisis y un plan de contenidos. Tú publicas a mano."
        actions={list.length > 0 ? addButton : undefined}
      />

      {profiles.isPending ? (
        <Skeleton className="h-64" />
      ) : !selected ? (
        <EmptyState
          icon={ScanSearch}
          title="Añade la cuenta que quieres analizar"
          description="Empieza por la tuya: elige la red y escribe el nombre de usuario. No hace falta conectarla; con capturas de pantalla basta."
          action={addButton}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <nav aria-label="Cuentas analizadas">
            <ul className="flex flex-col gap-1">
              {list.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-current={p.id === selected.id ? 'true' : undefined}
                    onClick={() => setSelectedId(p.id)}
                    className={cn(
                      'flex w-full flex-col items-start rounded-md px-3 py-2 text-left transition-base',
                      p.id === selected.id ? 'bg-accent-soft text-accent' : 'hover:bg-surface-2'
                    )}
                  >
                    <span className="max-w-full truncate text-sm font-semibold">@{p.username}</span>
                    <span className="text-xs text-muted">
                      {NETWORK_META[p.network].label} · {p.isOwn ? 'Tuya' : 'Referencia'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <section className="flex min-w-0 flex-col gap-4" aria-label={`@${selected.username}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold">@{selected.username}</h2>
                  <Badge tone="neutral">{NETWORK_META[selected.network].label}</Badge>
                  <Badge tone={selected.isOwn ? 'accent' : 'info'}>
                    {selected.isOwn ? 'Tu cuenta' : 'De referencia'}
                  </Badge>
                </div>
                {selected.displayName && (
                  <p className="text-sm text-muted">{selected.displayName}</p>
                )}
                {selected.notes && <p className="mt-1 text-xs text-subtle">{selected.notes}</p>}
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Editar @${selected.username}`}
                  onClick={() => setDialog({ profile: selected })}
                >
                  <Pencil aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-danger"
                  aria-label={`Quitar @${selected.username}`}
                  onClick={() => setToDelete(selected)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </div>
            <Segmented<Tab>
              aria-label="Sección"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'data', label: 'Datos', icon: Database },
                { value: 'audit', label: 'Análisis', icon: BarChart3 },
                { value: 'plan', label: 'Plan', icon: CalendarRange }
              ]}
            />
            {tab === 'data' && <DataPanel key={selected.id} profile={selected} />}
            {tab === 'audit' && <AuditPanel key={selected.id} profile={selected} />}
            {tab === 'plan' && <PlanPanel key={selected.id} profile={selected} />}
          </section>
        </div>
      )}

      <ProfileDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        profile={dialog?.profile ?? null}
        onSaved={(profile) => {
          setDialog(null)
          setSelectedId(profile.id)
        }}
      />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`¿Quitar @${toDelete?.username ?? ''} de la lista?`}
        description="Se ocultan sus datos, análisis y planes. Los borradores que creaste en el calendario se quedan."
        confirmLabel="Quitar"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          toDelete &&
          remove.mutate(
            { id: toDelete.id },
            {
              onSuccess: () => {
                setToDelete(null)
                setSelectedId(null)
              }
            }
          )
        }
      />
    </>
  )
}
