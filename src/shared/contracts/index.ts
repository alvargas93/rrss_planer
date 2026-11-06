import { z } from 'zod'
import { SettingsPatchSchema, SettingsSchema } from '../domain/settings'
import { AppInfoSchema } from '../domain/app-info'
import { IdSchema } from '../domain/common'
import { PillarCreateSchema, PillarSchema, PillarUpdateSchema } from '../domain/pillars'
import { IdeaCreateSchema, IdeaFilterSchema, IdeaSchema, IdeaUpdateSchema } from '../domain/ideas'
import { TaskCreateSchema, TaskMoveSchema, TaskSchema, TaskUpdateSchema } from '../domain/tasks'
import {
  PostCreateSchema,
  PostDetailSchema,
  PostListFilterSchema,
  PostScheduleSchema,
  PostSummarySchema,
  PostUpdateSchema
} from '../domain/posts'
import { MediaAssetSchema, MediaUpdateSchema } from '../domain/media'
import { DashboardSummarySchema } from '../domain/dashboard'

const ById = z.object({ id: IdSchema })

/**
 * Contratos IPC: la única lista de canales que existe.
 * - El proceso principal valida `input` antes de ejecutar.
 * - El preload solo deja pasar canales que estén aquí.
 * - La interfaz obtiene los tipos de entrada y salida automáticamente.
 *
 * Convención de nombre: `<módulo>:<acción>`.
 */
export const contracts = {
  'app:getInfo': { input: z.undefined(), output: AppInfoSchema },
  'app:openDataFolder': { input: z.undefined(), output: z.void() },
  'app:openExternal': { input: z.object({ url: z.url() }), output: z.void() },

  'settings:get': { input: z.undefined(), output: SettingsSchema },
  'settings:update': { input: SettingsPatchSchema, output: SettingsSchema },
  'settings:reset': { input: z.undefined(), output: SettingsSchema },

  'pillars:list': { input: z.undefined(), output: z.array(PillarSchema) },
  'pillars:create': { input: PillarCreateSchema, output: PillarSchema },
  'pillars:update': { input: PillarUpdateSchema, output: PillarSchema },
  'pillars:delete': { input: ById, output: z.void() },

  'ideas:list': { input: IdeaFilterSchema, output: z.array(IdeaSchema) },
  'ideas:create': { input: IdeaCreateSchema, output: IdeaSchema },
  'ideas:update': { input: IdeaUpdateSchema, output: IdeaSchema },
  'ideas:delete': { input: ById, output: z.void() },

  'tasks:list': { input: z.undefined(), output: z.array(TaskSchema) },
  'tasks:create': { input: TaskCreateSchema, output: TaskSchema },
  'tasks:update': { input: TaskUpdateSchema, output: TaskSchema },
  'tasks:move': { input: TaskMoveSchema, output: z.array(TaskSchema) },
  'tasks:delete': { input: ById, output: z.void() },

  'posts:list': { input: PostListFilterSchema, output: z.array(PostSummarySchema) },
  'posts:get': { input: ById, output: PostDetailSchema },
  'posts:create': { input: PostCreateSchema, output: PostDetailSchema },
  'posts:update': { input: PostUpdateSchema, output: PostDetailSchema },
  'posts:schedule': { input: PostScheduleSchema, output: PostSummarySchema },
  'posts:delete': { input: ById, output: z.void() },

  /** Abre el selector de archivos del sistema y copia los elegidos a la carpeta de medios. */
  'media:import': { input: z.undefined(), output: z.array(MediaAssetSchema) },
  'media:list': { input: z.undefined(), output: z.array(MediaAssetSchema) },
  'media:update': { input: MediaUpdateSchema, output: MediaAssetSchema },
  'media:delete': { input: ById, output: z.void() },

  'dashboard:summary': { input: z.undefined(), output: DashboardSummarySchema }
} as const

export type Contracts = typeof contracts
export type ChannelName = keyof Contracts
/** Lo que envía la interfaz (antes de aplicar valores por defecto). */
export type ChannelInput<K extends ChannelName> = z.input<Contracts[K]['input']>
/** Lo que recibe el manejador en el proceso principal (ya validado, con defaults). */
export type ChannelParsedInput<K extends ChannelName> = z.output<Contracts[K]['input']>
export type ChannelOutput<K extends ChannelName> = z.output<Contracts[K]['output']>

export const channelNames = Object.keys(contracts) as ChannelName[]

export function isChannelName(value: unknown): value is ChannelName {
  return typeof value === 'string' && value in contracts
}
