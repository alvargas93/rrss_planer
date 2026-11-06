import { z } from 'zod'
import { EntityBase, IdSchema } from './common'

export const IDEA_STATUSES = ['inbox', 'maturing', 'ready', 'used', 'discarded'] as const
export const IdeaStatusSchema = z.enum(IDEA_STATUSES)
export type IdeaStatus = z.infer<typeof IdeaStatusSchema>

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  inbox: 'Bandeja',
  maturing: 'Madurando',
  ready: 'Lista',
  used: 'Usada',
  discarded: 'Descartada'
}

export const IdeaSchema = z.object({
  ...EntityBase,
  title: z.string(),
  notes: z.string(),
  pillarId: IdSchema.nullable(),
  status: IdeaStatusSchema,
  source: z.string(),
  tags: z.array(z.string())
})
export type Idea = z.infer<typeof IdeaSchema>

export const IdeaCreateSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(200),
  notes: z.string().max(10_000).default(''),
  pillarId: IdSchema.nullable().default(null),
  status: IdeaStatusSchema.default('inbox'),
  source: z.string().trim().max(500).default(''),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([])
})
export type IdeaCreate = z.infer<typeof IdeaCreateSchema>

export const IdeaUpdateSchema = z.object({
  id: IdSchema,
  patch: IdeaCreateSchema.partial()
})
export type IdeaUpdate = z.infer<typeof IdeaUpdateSchema>

export const IdeaFilterSchema = z.object({
  status: IdeaStatusSchema.optional(),
  pillarId: IdSchema.optional(),
  includeArchived: z.boolean().default(false)
})
export type IdeaFilter = z.infer<typeof IdeaFilterSchema>
