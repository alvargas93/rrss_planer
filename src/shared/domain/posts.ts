import { z } from 'zod'
import { EntityBase, IdSchema, IsoDateSchema } from './common'
import { NETWORKS, POST_KINDS } from '../connectors/networks'
import { MediaAssetSchema } from './media'
import { PostTargetSchema } from './publishing'

export const NetworkSchema = z.enum(NETWORKS)
export const PostKindSchema = z.enum(POST_KINDS)

export const POST_STATUSES = [
  'draft',
  'scheduled',
  'publishing',
  'published',
  'partial',
  'failed',
  'cancelled'
] as const
export const PostStatusSchema = z.enum(POST_STATUSES)
export type PostStatus = z.infer<typeof PostStatusSchema>

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  draft: 'Borrador',
  scheduled: 'Programada',
  publishing: 'Publicando',
  published: 'Publicada',
  partial: 'Parcial',
  failed: 'Fallida',
  cancelled: 'Cancelada'
}

export const PostVariantSchema = z.object({
  ...EntityBase,
  postId: IdSchema,
  network: NetworkSchema,
  kind: PostKindSchema,
  text: z.string(),
  hashtags: z.array(z.string()),
  extra: z.record(z.string(), z.string())
})
export type PostVariant = z.infer<typeof PostVariantSchema>

export const PostSchema = z.object({
  ...EntityBase,
  title: z.string(),
  body: z.string(),
  pillarId: IdSchema.nullable(),
  ideaId: IdSchema.nullable(),
  status: PostStatusSchema,
  scheduledAt: z.string().nullable(),
  notes: z.string()
})
export type Post = z.infer<typeof PostSchema>

/** Resumen para listas y calendario. */
export const PostSummarySchema = PostSchema.extend({
  networks: z.array(NetworkSchema),
  mediaCount: z.number().int(),
  /** Primer medio, para una miniatura. */
  thumbnailUrl: z.string().nullable(),
  /** Destinos de publicación (una red → una cuenta). Vacío si nunca se programó. */
  targets: z.array(PostTargetSchema).default([])
})
export type PostSummary = z.infer<typeof PostSummarySchema>

/** Publicación completa para el compositor. */
export const PostDetailSchema = z.object({
  post: PostSchema,
  variants: z.array(PostVariantSchema),
  media: z.array(MediaAssetSchema),
  targets: z.array(PostTargetSchema).default([])
})
export type PostDetail = z.infer<typeof PostDetailSchema>

export const PostVariantInputSchema = z.object({
  network: NetworkSchema,
  kind: PostKindSchema,
  text: z.string().max(20_000).default(''),
  extra: z.record(z.string(), z.string()).default({})
})
export type PostVariantInput = z.infer<typeof PostVariantInputSchema>

export const PostCreateSchema = z.object({
  title: z.string().trim().min(1, 'Ponle un título para reconocerla').max(200),
  body: z.string().max(20_000).default(''),
  pillarId: IdSchema.nullable().default(null),
  ideaId: IdSchema.nullable().default(null),
  notes: z.string().max(10_000).default(''),
  scheduledAt: IsoDateSchema.nullable().default(null),
  variants: z.array(PostVariantInputSchema).default([]),
  mediaIds: z.array(IdSchema).default([])
})
export type PostCreate = z.infer<typeof PostCreateSchema>

export const PostUpdateSchema = z.object({
  id: IdSchema,
  patch: PostCreateSchema.partial()
})
export type PostUpdate = z.infer<typeof PostUpdateSchema>

/** Fijar o quitar la fecha programada (desde el calendario o el compositor). */
export const PostScheduleSchema = z.object({
  id: IdSchema,
  scheduledAt: IsoDateSchema.nullable()
})
export type PostSchedule = z.infer<typeof PostScheduleSchema>

export const PostListFilterSchema = z.object({
  /** Rango de fechas programadas (inclusive), ISO. */
  from: IsoDateSchema.optional(),
  to: IsoDateSchema.optional(),
  /** Solo sin fecha (borradores sueltos). */
  unscheduledOnly: z.boolean().default(false),
  status: PostStatusSchema.optional()
})
export type PostListFilter = z.infer<typeof PostListFilterSchema>
