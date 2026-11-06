import type { Task, TaskCreate, TaskMove, TaskUpdate } from '@shared/domain/tasks'
import type { TasksRepository } from '../repositories/tasks.repository'

export class TasksService {
  constructor(private readonly repo: TasksRepository) {}

  list(): Task[] {
    return this.repo.list()
  }

  create(input: TaskCreate): Task {
    return this.repo.create(input)
  }

  update(input: TaskUpdate): Task {
    return this.repo.update(input)
  }

  /**
   * Mueve una tarea a una columna y posición. Reescribe el orden de la columna de
   * origen (si cambia) y de la de destino para que no queden huecos.
   */
  move({ id, status, index }: TaskMove): Task[] {
    const task = this.repo.get(id)
    const originStatus = task.status
    const destination = this.repo.listByStatus(status).filter((t) => t.id !== id)
    const clamped = Math.min(Math.max(index, 0), destination.length)
    destination.splice(clamped, 0, task)
    this.repo.setColumnOrder(
      status,
      destination.map((t) => t.id)
    )
    if (originStatus !== status) {
      const origin = this.repo.listByStatus(originStatus).filter((t) => t.id !== id)
      this.repo.setColumnOrder(
        originStatus,
        origin.map((t) => t.id)
      )
    }
    return this.repo.list()
  }

  delete(id: string): void {
    this.repo.delete(id)
  }
}
