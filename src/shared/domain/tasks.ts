import { z } from 'zod'
import { EntityBase, IdSchema, IsoDateSchema } from './common'

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const
export const TaskStatusSchema = z.enum(TASK_STATUSES)
export type TaskStatus = z.infer<typeof TaskStatusSchema>

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Por hacer',
  doing: 'En curso',
  done: 'Hecho'
}

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const
export const TaskPrioritySchema = z.enum(TASK_PRIORITIES)
export type TaskPriority = z.infer<typeof TaskPrioritySchema>

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta'
}

export const TaskSchema = z.object({
  ...EntityBase,
  title: z.string(),
  description: z.string(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  dueAt: z.string().nullable(),
  ideaId: IdSchema.nullable(),
  postId: IdSchema.nullable(),
  sortOrder: z.number().int(),
  completedAt: z.string().nullable()
})
export type Task = z.infer<typeof TaskSchema>

export const TaskCreateSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(200),
  description: z.string().max(10_000).default(''),
  status: TaskStatusSchema.default('todo'),
  priority: TaskPrioritySchema.default('medium'),
  dueAt: IsoDateSchema.nullable().default(null),
  ideaId: IdSchema.nullable().default(null),
  postId: IdSchema.nullable().default(null)
})
export type TaskCreate = z.infer<typeof TaskCreateSchema>

export const TaskUpdateSchema = z.object({
  id: IdSchema,
  patch: TaskCreateSchema.partial()
})
export type TaskUpdate = z.infer<typeof TaskUpdateSchema>

/** Mover una tarea a una columna y posición (tablero). */
export const TaskMoveSchema = z.object({
  id: IdSchema,
  status: TaskStatusSchema,
  /** Posición dentro de la columna de destino (0 = arriba). */
  index: z.number().int().min(0)
})
export type TaskMove = z.infer<typeof TaskMoveSchema>
