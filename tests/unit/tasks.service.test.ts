import { describe, expect, it } from 'vitest'
import { TasksService } from '@main/services/tasks.service'
import type { TasksRepository } from '@main/repositories/tasks.repository'
import type { Task, TaskCreate, TaskStatus, TaskUpdate } from '@shared/domain/tasks'
import { AppError } from '@shared/domain/errors'

/** Repositorio en memoria con la misma interfaz que el de SQLite. */
class FakeTasksRepository implements Pick<
  TasksRepository,
  'list' | 'listByStatus' | 'get' | 'create' | 'update' | 'setColumnOrder' | 'delete'
> {
  private rows: Task[] = []
  private seq = 0

  list(): Task[] {
    return [...this.rows].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)
    )
  }

  listByStatus(status: TaskStatus): Task[] {
    return this.list().filter((t) => t.status === status)
  }

  get(id: string): Task {
    const task = this.rows.find((t) => t.id === id)
    if (!task) throw new AppError('NOT_FOUND', 'La tarea no existe')
    return task
  }

  create(input: TaskCreate): Task {
    const now = new Date(2026, 0, 1, 0, 0, this.seq).toISOString()
    const task: Task = {
      id: `t${++this.seq}`,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      dueAt: input.dueAt,
      ideaId: input.ideaId,
      postId: input.postId,
      sortOrder: this.listByStatus(input.status).length,
      completedAt: null,
      createdAt: now,
      updatedAt: now
    }
    this.rows.push(task)
    return task
  }

  update({ id, patch }: TaskUpdate): Task {
    const task = this.get(id)
    Object.assign(task, patch)
    return task
  }

  setColumnOrder(status: TaskStatus, orderedIds: string[]): void {
    orderedIds.forEach((id, index) => {
      const task = this.get(id)
      task.status = status
      task.sortOrder = index
      if (status === 'done' && !task.completedAt) task.completedAt = 'done'
    })
  }

  delete(id: string): void {
    this.rows = this.rows.filter((t) => t.id !== id)
  }
}

function setup(): { service: TasksService; ids: string[] } {
  const repo = new FakeTasksRepository()
  const service = new TasksService(repo as unknown as TasksRepository)
  const base: TaskCreate = {
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    dueAt: null,
    ideaId: null,
    postId: null
  }
  const ids = ['A', 'B', 'C'].map((title) => service.create({ ...base, title }).id)
  service.create({ ...base, title: 'D', status: 'doing' })
  return { service, ids }
}

const titles = (tasks: Task[], status: TaskStatus): string[] =>
  tasks.filter((t) => t.status === status).map((t) => t.title)

describe('TasksService.move', () => {
  it('reordena dentro de la misma columna', () => {
    const { service, ids } = setup()
    const result = service.move({ id: ids[2]!, status: 'todo', index: 0 })
    expect(titles(result, 'todo')).toEqual(['C', 'A', 'B'])
  })

  it('mueve a otra columna en la posición indicada y compacta el origen', () => {
    const { service, ids } = setup()
    const result = service.move({ id: ids[0]!, status: 'doing', index: 0 })
    expect(titles(result, 'doing')).toEqual(['A', 'D'])
    expect(titles(result, 'todo')).toEqual(['B', 'C'])
    expect(result.filter((t) => t.status === 'todo').map((t) => t.sortOrder)).toEqual([0, 1])
  })

  it('recorta un índice fuera de rango al final de la columna', () => {
    const { service, ids } = setup()
    const result = service.move({ id: ids[0]!, status: 'done', index: 99 })
    expect(titles(result, 'done')).toEqual(['A'])
  })

  it('al pasar a hecho se marca la fecha de finalización', () => {
    const { service, ids } = setup()
    const result = service.move({ id: ids[1]!, status: 'done', index: 0 })
    expect(result.find((t) => t.title === 'B')?.completedAt).not.toBeNull()
  })

  it('falla con una tarea inexistente', () => {
    const { service } = setup()
    expect(() => service.move({ id: 'nope', status: 'todo', index: 0 })).toThrow(AppError)
  })
})
