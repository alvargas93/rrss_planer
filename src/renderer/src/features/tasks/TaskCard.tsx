import { CalendarClock, GripVertical } from 'lucide-react'
import type { Task } from '@shared/domain/tasks'
import { TASK_PRIORITY_LABELS } from '@shared/domain/tasks'
import { Badge } from '@renderer/components/ui/badge'
import { fmtRelative, isOverdue } from '@renderer/lib/dates'
import { cn } from '@renderer/lib/utils'

const PRIORITY_TONE = { low: 'neutral', medium: 'info', high: 'danger' } as const

interface TaskCardProps {
  task: Task
  onOpen: () => void
  /** Props del asa de arrastre (dnd-kit); si no hay, la tarjeta no se arrastra. */
  handleProps?: Record<string, unknown>
  dragging?: boolean
  className?: string
}

export function TaskCard({
  task,
  onOpen,
  handleProps,
  dragging,
  className
}: TaskCardProps): React.JSX.Element {
  const overdue = task.status !== 'done' && isOverdue(task.dueAt)
  return (
    <div
      className={cn(
        'group flex gap-1 rounded-md border border-border bg-surface p-3 shadow-sm transition-base',
        dragging ? 'rotate-1 shadow-lg ring-2 ring-accent' : 'hover:shadow-md',
        task.status === 'done' && 'opacity-70',
        className
      )}
    >
      {handleProps && (
        <button
          type="button"
          aria-label={`Arrastrar ${task.title}`}
          className="-ml-1 cursor-grab touch-none self-start rounded-sm p-0.5 text-subtle opacity-0 transition-base group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
          {...handleProps}
        >
          <GripVertical size={16} aria-hidden />
        </button>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-1.5 text-left"
      >
        <span
          className={cn(
            'text-sm leading-snug font-medium',
            task.status === 'done' && 'line-through'
          )}
        >
          {task.title}
        </span>
        {task.description && (
          <span className="line-clamp-2 text-xs text-muted">{task.description}</span>
        )}
        <span className="flex flex-wrap items-center gap-1.5">
          {task.priority !== 'medium' && (
            <Badge tone={PRIORITY_TONE[task.priority]}>{TASK_PRIORITY_LABELS[task.priority]}</Badge>
          )}
          {task.dueAt && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[11px]',
                overdue ? 'font-semibold text-danger' : 'text-subtle'
              )}
            >
              <CalendarClock size={12} aria-hidden />
              {fmtRelative(task.dueAt)}
            </span>
          )}
        </span>
      </button>
    </div>
  )
}
