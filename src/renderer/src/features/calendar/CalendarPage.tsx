import * as React from 'react'
import { useNavigate } from 'react-router'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  setHours,
  setMinutes,
  startOfMonth,
  startOfWeek
} from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight, Inbox, Plus } from 'lucide-react'
import type { PostSummary } from '@shared/domain/posts'
import { PageHeader } from '@renderer/components/PageHeader'
import { Button } from '@renderer/components/ui/button'
import { Segmented } from '@renderer/components/ui/segmented'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { usePosts, useSchedulePost } from '@renderer/features/posts/usePosts'
import { dayKey } from '@renderer/lib/dates'
import { cn } from '@renderer/lib/utils'
import { useScreenContext } from '@renderer/features/ai/useScreenContext'
import { PostChip } from './PostChip'

type View = 'month' | 'week'
const weekOpts = { weekStartsOn: 1 as const }
const DEFAULT_HOUR = 10

function rangeFor(view: View, cursor: Date): { start: Date; end: Date } {
  if (view === 'week')
    return { start: startOfWeek(cursor, weekOpts), end: endOfWeek(cursor, weekOpts) }
  return {
    start: startOfWeek(startOfMonth(cursor), weekOpts),
    end: endOfWeek(endOfMonth(cursor), weekOpts)
  }
}

function daysBetween(start: Date, end: Date): Date[] {
  const days: Date[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  return days
}

function DayCell({
  day,
  posts,
  view,
  cursor,
  onOpen,
  onCreate
}: {
  day: Date
  posts: PostSummary[]
  view: View
  cursor: Date
  onOpen: (post: PostSummary) => void
  onCreate: (day: Date) => void
}): React.JSX.Element {
  const key = dayKey(day)
  const { setNodeRef, isOver } = useDroppable({ id: `day:${key}`, data: { day } })
  const outside = view === 'month' && !isSameMonth(day, cursor)
  const limit = view === 'month' ? 3 : Infinity
  const shown = posts.slice(0, limit)
  const hidden = posts.length - shown.length

  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-label={format(day, "EEEE d 'de' MMMM", { locale: es })}
      className={cn(
        'group relative flex min-h-0 flex-col gap-1 border-t border-l border-border p-1.5 transition-base',
        view === 'month' ? 'min-h-28' : 'min-h-[60vh]',
        outside && 'bg-surface-2/40 text-subtle',
        isOver && 'bg-accent-soft/60 ring-2 ring-accent/50 ring-inset'
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'grid size-6 place-items-center rounded-full text-xs font-semibold',
            isToday(day) && 'bg-accent text-accent-fg'
          )}
        >
          {format(day, 'd')}
        </span>
        <button
          type="button"
          aria-label={`Nueva publicación el ${format(day, 'd MMMM', { locale: es })}`}
          onClick={() => onCreate(day)}
          className="rounded-sm p-0.5 text-subtle opacity-0 transition-base group-hover:opacity-100 hover:text-accent focus-visible:opacity-100"
        >
          <Plus size={14} aria-hidden />
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {shown.map((post) => (
          <li key={post.id}>
            <PostChip post={post} onOpen={onOpen} compact={view === 'month'} />
          </li>
        ))}
      </ul>
      {hidden > 0 && <span className="text-[10px] text-subtle">+{hidden} más</span>}
    </div>
  )
}

function DraftsTray({
  drafts,
  onOpen
}: {
  drafts: PostSummary[]
  onOpen: (post: PostSummary) => void
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: 'tray' })
  return (
    <aside
      ref={setNodeRef}
      aria-label="Borradores sin fecha"
      className={cn(
        'flex w-64 shrink-0 flex-col gap-2 rounded-lg border border-border bg-surface-2/60 p-3 transition-base',
        isOver && 'ring-2 ring-accent/50'
      )}
    >
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <Inbox size={16} aria-hidden /> Borradores
        <span className="text-subtle">{drafts.length}</span>
      </h2>
      <p className="text-[11px] text-muted">
        Arrastra un borrador a un día para programarlo, o devuélvelo aquí.
      </p>
      <ul className="flex flex-col gap-1.5">
        {drafts.map((post) => (
          <li key={post.id}>
            <PostChip post={post} onOpen={onOpen} />
          </li>
        ))}
        {drafts.length === 0 && (
          <li className="rounded-md border border-dashed border-border-strong p-3 text-center text-xs text-subtle">
            Sin borradores sueltos
          </li>
        )}
      </ul>
    </aside>
  )
}

export function CalendarPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [view, setView] = React.useState<View>('month')
  const [cursor, setCursor] = React.useState(() => new Date())
  const [active, setActive] = React.useState<PostSummary | null>(null)
  const schedule = useSchedulePost()
  useScreenContext({ screen: 'calendar' })

  const { start, end } = rangeFor(view, cursor)
  const scheduled = usePosts({ from: start.toISOString(), to: end.toISOString() })
  const drafts = usePosts({ unscheduledOnly: true })
  const days = React.useMemo(() => daysBetween(start, end), [start, end])

  const byDay = React.useMemo(() => {
    const map = new Map<string, PostSummary[]>()
    for (const post of scheduled.data ?? []) {
      if (!post.scheduledAt) continue
      const key = dayKey(new Date(post.scheduledAt))
      map.set(key, [...(map.get(key) ?? []), post])
    }
    for (const list of map.values())
      list.sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))
    return map
  }, [scheduled.data])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  )

  const onDragStart = (event: DragStartEvent): void => {
    setActive((event.active.data.current as { post?: PostSummary } | undefined)?.post ?? null)
  }

  const onDragEnd = (event: DragEndEvent): void => {
    setActive(null)
    const { active: dragged, over } = event
    if (!over) return
    const post = (dragged.data.current as { post?: PostSummary } | undefined)?.post
    if (!post) return
    const overId = String(over.id)
    if (overId === 'tray') {
      if (post.scheduledAt) schedule.mutate({ id: post.id, scheduledAt: null })
      return
    }
    if (!overId.startsWith('day:')) return
    const day = (over.data.current as { day?: Date } | undefined)?.day
    if (!day) return
    const previous = post.scheduledAt ? new Date(post.scheduledAt) : null
    if (previous && isSameDay(previous, day)) return
    const hours = previous ? previous.getHours() : DEFAULT_HOUR
    const minutes = previous ? previous.getMinutes() : 0
    const next = setMinutes(setHours(day, hours), minutes)
    schedule.mutate({ id: post.id, scheduledAt: next.toISOString() })
  }

  const open = (post: PostSummary): void => {
    void navigate(`/compose/${post.id}`)
  }
  const create = (day: Date): void => {
    void navigate(
      `/compose?date=${encodeURIComponent(setMinutes(setHours(day, DEFAULT_HOUR), 0).toISOString())}`
    )
  }

  const label =
    view === 'month'
      ? format(cursor, 'LLLL yyyy', { locale: es })
      : `${format(start, 'd MMM', { locale: es })} – ${format(end, 'd MMM yyyy', { locale: es })}`

  const shift = (delta: number): void =>
    setCursor(view === 'month' ? addMonths(cursor, delta) : addWeeks(cursor, delta))

  return (
    <>
      <PageHeader
        title="Calendario"
        description="Cuándo sale cada publicación. Arrastra para cambiar el día; la hora se mantiene."
        actions={
          <Button onClick={() => navigate('/compose')}>
            <Plus aria-hidden /> Nueva publicación
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" aria-label="Anterior" onClick={() => shift(-1)}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button size="icon" variant="outline" aria-label="Siguiente" onClick={() => shift(1)}>
            <ChevronRight aria-hidden />
          </Button>
          <Button variant="outline" onClick={() => setCursor(new Date())}>
            Hoy
          </Button>
        </div>
        <h2 className="text-lg font-semibold capitalize">{label}</h2>
        <div className="ml-auto">
          <Segmented
            aria-label="Vista del calendario"
            value={view}
            onChange={setView}
            options={[
              { value: 'month', label: 'Mes', icon: CalendarDays },
              { value: 'week', label: 'Semana' }
            ]}
          />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
      >
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1 overflow-hidden rounded-lg border-r border-b border-border bg-surface">
            <div className="grid grid-cols-7">
              {days.slice(0, 7).map((day) => (
                <div
                  key={day.toISOString()}
                  className="border-l border-border px-2 py-1.5 text-center text-[11px] font-semibold text-muted uppercase"
                >
                  {format(day, 'EEE', { locale: es })}
                </div>
              ))}
            </div>
            {scheduled.isPending ? (
              <Skeleton className="h-[60vh] rounded-none" />
            ) : (
              <div className="grid grid-cols-7">
                {days.map((day) => (
                  <DayCell
                    key={day.toISOString()}
                    day={day}
                    posts={byDay.get(dayKey(day)) ?? []}
                    view={view}
                    cursor={cursor}
                    onOpen={open}
                    onCreate={create}
                  />
                ))}
              </div>
            )}
          </div>
          <DraftsTray drafts={drafts.data ?? []} onOpen={open} />
        </div>
        <DragOverlay dropAnimation={null}>
          {active && (
            <div className="w-56">
              <PostChip post={active} onOpen={() => undefined} overlay />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {schedule.isError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          No se pudo mover la publicación: {schedule.error.message}
        </p>
      )}
    </>
  )
}
