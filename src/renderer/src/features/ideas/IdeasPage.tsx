import * as React from 'react'
import { useNavigate } from 'react-router'
import { Lightbulb, MoreHorizontal, Pencil, Plus, SquarePen, Tags, Trash2 } from 'lucide-react'
import { IDEA_STATUSES, IDEA_STATUS_LABELS, type Idea, type IdeaStatus } from '@shared/domain/ideas'
import { PageHeader } from '@renderer/components/PageHeader'
import { EmptyState } from '@renderer/components/EmptyState'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { PillarBadge } from '@renderer/features/pillars/PillarBadge'
import { PillarsDialog } from '@renderer/features/pillars/PillarsDialog'
import { usePillars } from '@renderer/features/pillars/usePillars'
import { fmtRelative } from '@renderer/lib/dates'
import { cn } from '@renderer/lib/utils'
import { useScreenContext } from '@renderer/features/ai/useScreenContext'
import { IdeaDialog } from './IdeaDialog'
import { useDeleteIdea, useIdeas, useUpdateIdea } from './useIdeas'

type StatusFilter = IdeaStatus | 'active' | 'all'

const STATUS_TONE: Record<IdeaStatus, 'neutral' | 'accent' | 'success' | 'warning' | 'info'> = {
  inbox: 'info',
  maturing: 'warning',
  ready: 'success',
  used: 'neutral',
  discarded: 'neutral'
}

function IdeaCard({
  idea,
  onEdit,
  onDelete
}: {
  idea: Idea
  onEdit: () => void
  onDelete: () => void
}): React.JSX.Element {
  const navigate = useNavigate()
  const update = useUpdateIdea()
  const { data: pillars = [] } = usePillars()
  const pillar = pillars.find((p) => p.id === idea.pillarId)

  return (
    <li className="group flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-sm transition-base hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="text-left text-[15px] leading-snug font-semibold hover:text-accent"
        >
          {idea.title}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              aria-label={`Acciones de ${idea.title}`}
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil aria-hidden /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate(`/compose?ideaId=${idea.id}`)}>
              <SquarePen aria-hidden /> Crear borrador
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Mover a</DropdownMenuLabel>
            {IDEA_STATUSES.filter((s) => s !== idea.status).map((status) => (
              <DropdownMenuItem
                key={status}
                onSelect={() => update.mutate({ id: idea.id, patch: { status } })}
              >
                {IDEA_STATUS_LABELS[status]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onDelete}>
              <Trash2 aria-hidden /> Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {idea.notes && (
        <p className="line-clamp-3 text-sm whitespace-pre-line text-muted">{idea.notes}</p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <Badge tone={STATUS_TONE[idea.status]}>{IDEA_STATUS_LABELS[idea.status]}</Badge>
        <PillarBadge pillar={pillar} />
        {idea.tags.map((tag) => (
          <span key={tag} className="text-[11px] text-subtle">
            #{tag}
          </span>
        ))}
        <span className="ml-auto text-[11px] text-subtle">{fmtRelative(idea.updatedAt)}</span>
      </div>
    </li>
  )
}

export function IdeasPage(): React.JSX.Element {
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('active')
  const [pillarFilter, setPillarFilter] = React.useState<string | null>(null)
  const [dialog, setDialog] = React.useState<{ open: boolean; idea?: Idea }>({ open: false })
  const [pillarsOpen, setPillarsOpen] = React.useState(false)
  const [toDelete, setToDelete] = React.useState<Idea | null>(null)

  const filter = {
    status: statusFilter === 'active' || statusFilter === 'all' ? undefined : statusFilter,
    includeArchived: statusFilter === 'all',
    pillarId: pillarFilter ?? undefined
  }
  const ideas = useIdeas(filter)
  const { data: pillars = [] } = usePillars()
  const remove = useDeleteIdea()
  useScreenContext({ screen: 'ideas' })

  const filters: Array<{ value: StatusFilter; label: string }> = [
    { value: 'active', label: 'Activas' },
    ...IDEA_STATUSES.map((s) => ({ value: s, label: IDEA_STATUS_LABELS[s] })),
    { value: 'all', label: 'Todas' }
  ]

  return (
    <>
      <PageHeader
        title="Ideas"
        description="Tu banco de ideas. Captura rápido, madura con calma y convierte en borrador cuando esté lista."
        actions={
          <>
            <Button variant="outline" onClick={() => setPillarsOpen(true)}>
              <Tags aria-hidden /> Pilares
            </Button>
            <Button onClick={() => setDialog({ open: true })}>
              <Plus aria-hidden /> Nueva idea
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={statusFilter === f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'rounded-full px-3 py-1 text-sm font-medium transition-base',
                statusFilter === f.value
                  ? 'bg-text text-bg'
                  : 'bg-surface-2 text-muted hover:text-text'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {pillars.length > 0 && (
          <div role="group" aria-label="Filtrar por pilar" className="ml-auto flex flex-wrap gap-1">
            {pillars.map((pillar) => (
              <button
                key={pillar.id}
                type="button"
                aria-pressed={pillarFilter === pillar.id}
                onClick={() => setPillarFilter(pillarFilter === pillar.id ? null : pillar.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-base',
                  pillarFilter === pillar.id
                    ? 'border-text bg-text text-bg'
                    : 'border-border text-muted hover:text-text'
                )}
              >
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: pillar.color }}
                />
                {pillar.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {ideas.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : ideas.data && ideas.data.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ideas.data.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onEdit={() => setDialog({ open: true, idea })}
              onDelete={() => setToDelete(idea)}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Lightbulb}
          title={
            statusFilter === 'active' && !pillarFilter
              ? 'Sin ideas todavía'
              : 'Nada con estos filtros'
          }
          description="Apunta aquí cualquier chispa: un tema, un gancho, algo que viste y te gustaría versionar."
          action={
            <Button onClick={() => setDialog({ open: true })}>
              <Plus aria-hidden /> Nueva idea
            </Button>
          }
        />
      )}

      <IdeaDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog({ ...dialog, open })}
        idea={dialog.idea}
      />
      <PillarsDialog open={pillarsOpen} onOpenChange={setPillarsOpen} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="¿Eliminar esta idea?"
        description={toDelete?.title}
        confirmLabel="Eliminar"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          toDelete && remove.mutate({ id: toDelete.id }, { onSuccess: () => setToDelete(null) })
        }
      />
    </>
  )
}
