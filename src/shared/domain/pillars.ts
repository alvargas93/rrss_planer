import { z } from 'zod'
import { EntityBase, HexColorSchema, IdSchema } from './common'

export const PillarSchema = z.object({
  ...EntityBase,
  name: z.string(),
  description: z.string(),
  color: HexColorSchema,
  sortOrder: z.number().int()
})
export type Pillar = z.infer<typeof PillarSchema>

export const PillarCreateSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(60),
  description: z.string().trim().max(500).default(''),
  color: HexColorSchema
})
export type PillarCreate = z.infer<typeof PillarCreateSchema>

export const PillarUpdateSchema = z.object({
  id: IdSchema,
  patch: PillarCreateSchema.partial().extend({ sortOrder: z.number().int().optional() })
})
export type PillarUpdate = z.infer<typeof PillarUpdateSchema>
