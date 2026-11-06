import { Check } from 'lucide-react'
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, type Task } from '@shared/domain/tasks'
import { Badge } from '@renderer/components/ui/badge'
import { fmtDay, isOverdue } from '@renderer/lib/dates'
import { cn } from '@renderer/lib/utils'
import { useUpdateTask } from './useTasks'

const PRIORITY_TONE = { low: 'neutral', medium: 'info', high: 'danger' } as const
const STATUS_TONE = { todo: 'neutral', doing: 'warning', done: 'success' } as const

export function TaskList({
  tasks,
  onOpen
}: {
  tasks: Task[]
  onOpen: (task: Task) => void
}): React.JSX.Element {
  const update = useUpdateTask()
  const sorted = [...tasks].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'done' ? 1 : b.status === 'done' ? -1 : 0
    return (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999')
  })

  return (
    <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-lg border border-border bg-surface text-sm">
      <thead>
        <tr className="text-left text-xs text-muted">
          <th scope="col" className="w-10 px-3 py-2">
            <span className="sr-only">Hecha</span>
          </th>
          <th scope="col" className="px-3 py-2 font-medium">
            Tarea
          </th>
          <th scope="col" className="px-3 py-2 font-medium">
            Estado
          </th>
          <th scope="col" className="px-3 py-2 font-medium">
            Prioridad
          </th>
          <th scope="col" className="px-3 py-2 font-medium">
            Fecha límite
          </th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((task) => {
          const done = task.status === 'done'
          return (
            <tr key={task.id} className="border-t border-border transition-base hover:bg-surface-2">
              <td className="border-t border-border px-3 py-2">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  aria-label={done ? `Reabrir ${task.title}` : `Marcar ${task.title} como hecha`}
                  onClick={() =>
                    update.mutate({ id: task.id, patch: { status: done ? 'todo' : 'done' } })
                  }
                  className={cn(
                    'grid size-5 place-items-center rounded-full border transition-base',
                    done
                      ? 'border-accent bg-accent text-accent-fg'
                      : 'border-border-strong hover:border-accent'
                  )}
                >
                  {done && <Check size={12} aria-hidden />}
                </button>
              </td>
              <td className="border-t border-border px-3 py-2">
                <button
                  type="button"
                  onClick={() => onOpen(task)}
                  className={cn(
                    'text-left font-medium hover:text-accent',
                    done && 'text-muted line-through'
                  )}
                >
                  {task.title}
                </button>
              </td>
              <td className="border-t border-border px-3 py-2">
                <Badge tone={STATUS_TONE[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge>
              </td>
              <td className="border-t border-border px-3 py-2">
                <Badge tone={PRIORITY_TONE[task.priority]}>
                  {TASK_PRIORITY_LABELS[task.priority]}
                </Badge>
              </td>
              <td
                className={cn(
                  'border-t border-border px-3 py-2',
                  !done && isOverdue(task.dueAt) && 'font-semibold text-danger'
                )}
              >
                {task.dueAt ? fmtDay(task.dueAt) : <span className="text-subtle">—</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
