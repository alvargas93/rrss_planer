import * as React from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus } from 'lucide-react'
import { TASK_STATUSES, TASK_STATUS_LABELS, type Task, type TaskStatus } from '@shared/domain/tasks'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { TaskCard } from './TaskCard'
import { useMoveTask } from './useTasks'

function SortableTask({ task, onOpen }: { task: Task; onOpen: () => void }): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: task.status }
  })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
    >
      <TaskCard task={task} onOpen={onOpen} handleProps={{ ...attributes, ...listeners }} />
    </li>
  )
}

function Column({
  status,
  tasks,
  onOpen,
  onAdd
}: {
  status: TaskStatus
  tasks: Task[]
  onOpen: (task: Task) => void
  onAdd: () => void
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}`, data: { status } })
  return (
    <section
      aria-label={TASK_STATUS_LABELS[status]}
      className={cn(
        'flex min-h-[60vh] flex-col rounded-lg border border-border bg-surface-2/60 p-2 transition-base',
        isOver && 'ring-2 ring-accent/50'
      )}
    >
      <header className="flex items-center justify-between px-2 py-1.5">
        <h2 className="text-sm font-semibold">
          {TASK_STATUS_LABELS[status]}
          <span className="ml-1.5 text-subtle">{tasks.length}</span>
        </h2>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={`Añadir en ${TASK_STATUS_LABELS[status]}`}
          onClick={onAdd}
        >
          <Plus aria-hidden />
        </Button>
      </header>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex flex-1 flex-col gap-2 p-1">
          {tasks.map((task) => (
            <SortableTask key={task.id} task={task} onOpen={() => onOpen(task)} />
          ))}
          {tasks.length === 0 && (
            <li className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border-strong p-4 text-center text-xs text-subtle">
              Arrastra tareas aquí
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  )
}

export function TaskBoard({
  tasks,
  onOpen,
  onAdd
}: {
  tasks: Task[]
  onOpen: (task: Task) => void
  onAdd: (status: TaskStatus) => void
}): React.JSX.Element {
  const move = useMoveTask()
  const [active, setActive] = React.useState<Task | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const byStatus = React.useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] }
    for (const task of tasks) map[task.status].push(task)
    return map
  }, [tasks])

  const onDragStart = (event: DragStartEvent): void => {
    setActive(tasks.find((t) => t.id === event.active.id) ?? null)
  }

  const onDragEnd = (event: DragEndEvent): void => {
    setActive(null)
    const { active: dragged, over } = event
    if (!over) return
    const overId = String(over.id)
    let status: TaskStatus
    let index: number
    if (overId.startsWith('column:')) {
      status = overId.slice('column:'.length) as TaskStatus
      index = byStatus[status].length
    } else {
      const target = tasks.find((t) => t.id === overId)
      if (!target) return
      status = target.status
      index = byStatus[status].findIndex((t) => t.id === overId)
    }
    const current = tasks.find((t) => t.id === dragged.id)
    if (!current) return
    const currentIndex = byStatus[current.status].findIndex((t) => t.id === current.id)
    if (current.status === status && currentIndex === index) return
    move.mutate({ id: String(dragged.id), status, index })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="grid grid-cols-3 gap-4">
        {TASK_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={byStatus[status]}
            onOpen={onOpen}
            onAdd={() => onAdd(status)}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {active && <TaskCard task={active} onOpen={() => undefined} dragging className="w-64" />}
      </DragOverlay>
    </DndContext>
  )
}
