import { Link, useNavigate } from 'react-router'
import { ArrowRight, CalendarDays, Lightbulb, ListTodo, Plus, SquarePen, Tags } from 'lucide-react'
import type { DashboardSummary } from '@shared/domain/dashboard'
import { NETWORK_META } from '@shared/connectors/networks'
import { PageHeader } from '@renderer/components/PageHeader'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { keys, useIpcQuery } from '@renderer/lib/queries'
import { fmtDateTime, fmtRelative, isOverdue } from '@renderer/lib/dates'
import { cn } from '@renderer/lib/utils'
import { useScreenContext } from '@renderer/features/ai/useScreenContext'

function Stat({
  label,
  value,
  to,
  icon: Icon
}: {
  label: string
  value: number
  to: string
  icon: typeof ListTodo
}): React.JSX.Element {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm transition-base hover:shadow-md"
    >
      <span className="grid size-10 place-items-center rounded-md bg-accent-soft text-accent">
        <Icon size={20} strokeWidth={1.75} aria-hidden />
      </span>
      <span>
        <span className="block text-2xl font-semibold tracking-tight">{value}</span>
        <span className="block text-xs text-muted">{label}</span>
      </span>
    </Link>
  )
}

export function DashboardPage(): React.JSX.Element {
  const navigate = useNavigate()
  useScreenContext({ screen: 'dashboard' })
  const summary = useIpcQuery(keys.dashboard, 'dashboard:summary', undefined)
  const data: DashboardSummary | undefined = summary.data

  return (
    <>
      <PageHeader
        title="Inicio"
        description="Un vistazo a lo que tienes entre manos y lo que sale esta semana."
        actions={
          <Button onClick={() => navigate('/compose')}>
            <Plus aria-hidden /> Nueva publicación
          </Button>
        }
      />

      {summary.isPending || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Tareas abiertas" value={data.tasksOpen} to="/tasks" icon={ListTodo} />
            <Stat label="Ideas en bandeja" value={data.ideasInbox} to="/ideas" icon={Lightbulb} />
            <Stat
              label="Borradores sin fecha"
              value={data.drafts}
              to="/calendar"
              icon={SquarePen}
            />
            <Stat label="Pilares" value={data.pillars} to="/ideas" icon={Tags} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Próximos 7 días</CardTitle>
                <CardDescription>Publicaciones programadas.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.scheduledThisWeek.length === 0 ? (
                  <p className="text-sm text-muted">
                    Nada programado.{' '}
                    <Link to="/calendar" className="text-accent hover:underline">
                      Ir al calendario
                    </Link>
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border">
                    {data.scheduledThisWeek.map((post) => (
                      <li key={post.id}>
                        <Link
                          to={`/compose/${post.id}`}
                          className="flex items-center gap-3 py-2 text-sm hover:text-accent"
                        >
                          <CalendarDays size={16} className="shrink-0 text-subtle" aria-hidden />
                          <span className="min-w-0 flex-1 truncate font-medium">{post.title}</span>
                          <span className="text-xs text-muted">
                            {post.networks.map((n) => NETWORK_META[n].label).join(' · ') ||
                              'Sin red'}
                          </span>
                          <span className="shrink-0 text-xs text-subtle">
                            {post.scheduledAt && fmtDateTime(post.scheduledAt)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tareas con fecha cercana</CardTitle>
                <CardDescription>Vencen en los próximos 7 días o ya han vencido.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.tasksDueSoon.length === 0 ? (
                  <p className="text-sm text-muted">Nada urgente. Bien.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border">
                    {data.tasksDueSoon.map((task) => (
                      <li key={task.id} className="flex items-center gap-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
                        <span
                          className={cn(
                            'shrink-0 text-xs',
                            task.dueAt && isOverdue(task.dueAt)
                              ? 'font-semibold text-danger'
                              : 'text-subtle'
                          )}
                        >
                          {task.dueAt && fmtRelative(task.dueAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Button asChild variant="ghost" size="sm" className="mt-3 -ml-2">
                  <Link to="/tasks">
                    Ver todas <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  )
}
