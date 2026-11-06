import type { DashboardSummary } from '@shared/domain/dashboard'
import type { TasksRepository } from '../repositories/tasks.repository'
import type { IdeasRepository } from '../repositories/ideas.repository'
import type { PostsRepository } from '../repositories/posts.repository'
import type { PillarsRepository } from '../repositories/pillars.repository'

const DAY_MS = 24 * 60 * 60 * 1000

export class DashboardService {
  constructor(
    private readonly tasks: TasksRepository,
    private readonly ideas: IdeasRepository,
    private readonly posts: PostsRepository,
    private readonly pillars: PillarsRepository
  ) {}

  summary(now = new Date()): DashboardSummary {
    const open = this.tasks.list().filter((task) => task.status !== 'done')
    const horizon = new Date(now.getTime() + 7 * DAY_MS).toISOString()
    const tasksDueSoon = open
      .filter((task) => task.dueAt && task.dueAt <= horizon)
      .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
      .slice(0, 5)

    // Semana en curso: de hoy a +7 días (más útil que lunes-domingo para "qué viene").
    const scheduledThisWeek = this.posts.list({
      from: new Date(now.getTime() - DAY_MS).toISOString(),
      to: horizon,
      unscheduledOnly: false
    })

    return {
      tasksOpen: open.length,
      tasksDueSoon,
      ideasInbox: this.ideas.countByStatus('inbox'),
      ideasReady: this.ideas.countByStatus('ready'),
      drafts: this.posts.countByStatus('draft'),
      scheduledThisWeek,
      pillars: this.pillars.count()
    }
  }
}
