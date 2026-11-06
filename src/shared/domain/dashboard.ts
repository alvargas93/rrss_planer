import { z } from 'zod'
import { PostSummarySchema } from './posts'
import { TaskSchema } from './tasks'

export const DashboardSummarySchema = z.object({
  tasksOpen: z.number().int(),
  tasksDueSoon: z.array(TaskSchema),
  ideasInbox: z.number().int(),
  ideasReady: z.number().int(),
  drafts: z.number().int(),
  scheduledThisWeek: z.array(PostSummarySchema),
  pillars: z.number().int()
})
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>
