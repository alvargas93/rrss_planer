import * as React from 'react'
import { KanbanSquare, List, ListTodo, Plus } from 'lucide-react'
import type { Task, TaskStatus } from '@shared/domain/tasks'
import { PageHeader } from '@renderer/components/PageHeader'
import { EmptyState } from '@renderer/components/EmptyState'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { Button } from '@renderer/components/ui/button'
import { Segmented } from '@renderer/components/ui/segmented'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { TaskBoard } from './TaskBoard'
import { TaskList } from './TaskList'
import { TaskDialog } from './TaskDialog'
import { useDeleteTask, useTasks } from './useTasks'

type View = 'board' | 'list'

export function TasksPage(): React.JSX.Element {
  const tasks = useTasks()
  const remove = useDeleteTask()
  const [view, setView] = React.useState<View>('board')
  const [dialog, setDialog] = React.useState<{ open: boolean; task?: Task; status?: TaskStatus }>({
    open: false
  })
  const [toDelete, setToDelete] = React.useState<Task | null>(null)

  const openTask = (task: Task): void => setDialog({ open: true, task })
  const addTask = (status?: TaskStatus): void => setDialog({ open: true, status })

  return (
    <>
      <PageHeader
        title="Tareas"
        description="Lo que tienes que hacer para que el contenido salga: grabar, editar, escribir, revisar."
        actions={
          <>
            <Segmented
              aria-label="Vista"
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: 'Tablero', icon: KanbanSquare },
                { value: 'list', label: 'Lista', icon: List }
              ]}
            />
            <Button onClick={() => addTask()}>
              <Plus aria-hidden /> Nueva tarea
            </Button>
          </>
        }
      />

      {tasks.isPending ? (
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : tasks.data && tasks.data.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Sin tareas"
          description="Crea la primera. Luego podrás arrastrarlas entre columnas conforme avancen."
          action={
            <Button onClick={() => addTask()}>
              <Plus aria-hidden /> Nueva tarea
            </Button>
          }
        />
      ) : view === 'board' ? (
        <TaskBoard tasks={tasks.data ?? []} onOpen={openTask} onAdd={addTask} />
      ) : (
        <TaskList tasks={tasks.data ?? []} onOpen={openTask} />
      )}

      <TaskDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog({ ...dialog, open })}
        task={dialog.task}
        defaultStatus={dialog.status}
        onDelete={() => {
          setToDelete(dialog.task ?? null)
          setDialog({ open: false })
        }}
      />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="¿Eliminar esta tarea?"
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
