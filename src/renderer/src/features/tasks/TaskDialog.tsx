import * as React from 'react'
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type Task,
  type TaskCreate,
  type TaskPriority,
  type TaskStatus
} from '@shared/domain/tasks'
import { Button } from '@renderer/components/ui/button'
import { Field, Input, Textarea } from '@renderer/components/ui/input'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { fromDateInput, toDateInput } from '@renderer/lib/dates'
import { useCreateTask, useUpdateTask } from './useTasks'

interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: Task
  /** Columna por defecto al crear desde el tablero. */
  defaultStatus?: TaskStatus
  /** Si se pasa (al editar), muestra el botón de eliminar. */
  onDelete?: () => void
}

const empty: TaskCreate = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  dueAt: null,
  ideaId: null,
  postId: null
}

function initialForm(task?: Task, defaultStatus?: TaskStatus): TaskCreate {
  return task
    ? {
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        dueAt: task.dueAt,
        ideaId: task.ideaId,
        postId: task.postId
      }
    : { ...empty, status: defaultStatus ?? 'todo' }
}

function TaskForm({
  task,
  defaultStatus,
  onDelete,
  onClose
}: {
  task?: Task
  defaultStatus?: TaskStatus
  onDelete?: () => void
  onClose: () => void
}): React.JSX.Element {
  const create = useCreateTask()
  const update = useUpdateTask()
  const [form, setForm] = React.useState<TaskCreate>(() => initialForm(task, defaultStatus))

  const pending = create.isPending || update.isPending
  const error = create.error ?? update.error

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    if (task) update.mutate({ id: task.id, patch: form }, { onSuccess: onClose })
    else create.mutate(form, { onSuccess: onClose })
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{task ? 'Editar tarea' : 'Nueva tarea'}</DialogTitle>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <Field label="Título" htmlFor="task-title">
          <Input
            id="task-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Grabar el reel del lunes"
            required
            autoFocus
          />
        </Field>
        <Field label="Descripción" htmlFor="task-description">
          <Textarea
            id="task-description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Estado" htmlFor="task-status">
            <Select
              value={form.status}
              onValueChange={(status) => setForm({ ...form, status: status as TaskStatus })}
            >
              <SelectTrigger id="task-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Prioridad" htmlFor="task-priority">
            <Select
              value={form.priority}
              onValueChange={(priority) => setForm({ ...form, priority: priority as TaskPriority })}
            >
              <SelectTrigger id="task-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {TASK_PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Fecha límite" htmlFor="task-due">
            <Input
              id="task-due"
              type="date"
              value={toDateInput(form.dueAt)}
              onChange={(e) => setForm({ ...form, dueAt: fromDateInput(e.target.value) })}
            />
          </Field>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        {task && onDelete && (
          <Button type="button" variant="ghost" className="mr-auto text-danger" onClick={onDelete}>
            Eliminar
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !form.title.trim()}>
          {task ? 'Guardar' : 'Crear tarea'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaultStatus,
  onDelete
}: TaskDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <TaskForm
          key={task?.id ?? `new-${defaultStatus ?? 'todo'}`}
          task={task}
          defaultStatus={defaultStatus}
          onDelete={onDelete}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
