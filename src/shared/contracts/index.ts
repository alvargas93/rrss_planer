import { z } from 'zod'
import {
  BackupRunResultSchema,
  BackupStatusSchema,
  SnapshotInfoSchema,
  UpdateStateSchema
} from '../domain/system'
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
import {
  ActionRequestSchema,
  AiConversationSchema,
  AiMessageSchema,
  AiStatusSchema,
  ChatRequestSchema,
  ModelInfoSchema,
  ScreenContextSchema,
  UsageSummarySchema
} from '../domain/ai'

import {
  AccountByIdSchema,
  AccountSchema,
  InstagramOAuthConnectSchema,
  InstagramTokenConnectSchema,
  LinkedInTokenConnectSchema,
  OAuthConnectSchema
} from '../domain/accounts'
import {
  MarkManualSchema,
  PostTargetSchema,
  PublishNowSchema,
  SetTargetSchema,
  ValidationIssueSchema
} from '../domain/publishing'
import { CapabilitiesSchema } from '../connectors/Connector'
import {
  AnalyticsOverviewSchema,
  AnalyticsQuerySchema,
  SyncResultSchema
} from '../domain/analytics'
import {
  VideoProjectCreateSchema,
  VideoProjectSchema,
  VideoProjectUpdateSchema,
  CueSchema
} from '../domain/video'
import { NETWORKS } from '../connectors/networks'
import {
  AnalysisSchema,
  ApplyPlanSchema,
  AuditRequestSchema,
  PlanRequestSchema,
  ProfileCreateSchema,
  ProfileSchema,
  ProfileUpdateSchema,
  ReadScreenshotsResultSchema,
  ReadScreenshotsSchema,
  SnapshotCreateSchema,
  SnapshotSchema,
  SourcesStatusSchema
} from '../domain/analysis'

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
  /** Copia texto al portapapeles del sistema (publicación manual). */
  'app:copyText': { input: z.object({ text: z.string().max(50_000) }), output: z.void() },

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
  /** Guarda los archivos de la publicación en una carpeta elegida; null si se cancela. */
  'posts:exportMedia': {
    input: ById,
    output: z.object({ dir: z.string(), files: z.array(z.string()) }).nullable()
  },

  /** Abre el selector de archivos del sistema y copia los elegidos a la carpeta de medios. */
  'media:import': { input: z.undefined(), output: z.array(MediaAssetSchema) },
  'media:list': { input: z.undefined(), output: z.array(MediaAssetSchema) },
  'media:update': { input: MediaUpdateSchema, output: MediaAssetSchema },
  'media:delete': { input: ById, output: z.void() },
  /** Vuelve a analizar un vídeo (duración, miniatura). */
  'media:reprocess': { input: ById, output: MediaAssetSchema },
  /** Devuelve la versión JPEG de una imagen (la crea si hace falta). */
  'media:ensureJpeg': { input: ById, output: MediaAssetSchema },

  'dashboard:summary': { input: z.undefined(), output: DashboardSummarySchema },

  // --- cuentas conectadas ---
  'accounts:list': { input: z.undefined(), output: z.array(AccountSchema) },
  'accounts:connectInstagramToken': { input: InstagramTokenConnectSchema, output: AccountSchema },
  'accounts:connectInstagramOAuth': { input: InstagramOAuthConnectSchema, output: AccountSchema },
  /** YouTube, LinkedIn o X: abre el navegador y espera la autorización (OAuth con app propia). */
  'accounts:connectOAuth': { input: OAuthConnectSchema, output: AccountSchema },
  'accounts:connectLinkedInToken': { input: LinkedInTokenConnectSchema, output: AccountSchema },
  /** Qué apps de red tienen ya su ID de cliente y su secreto guardados. */
  'accounts:oauthClients': {
    input: z.undefined(),
    output: z.record(z.string(), z.object({ clientId: z.string(), hasSecret: z.boolean() }))
  },
  'accounts:refresh': { input: AccountByIdSchema, output: AccountSchema },
  'accounts:disconnect': { input: AccountByIdSchema, output: z.void() },
  'accounts:capabilities': {
    input: z.object({ network: z.enum(NETWORKS) }),
    output: CapabilitiesSchema
  },

  // --- publicación ---
  'publishing:setTarget': { input: SetTargetSchema, output: z.array(PostTargetSchema) },
  'publishing:publishNow': { input: PublishNowSchema, output: z.array(PostTargetSchema) },
  'publishing:validate': {
    input: ById.extend({ id: IdSchema }),
    output: z.record(z.string(), z.array(ValidationIssueSchema))
  },
  'publishing:retry': { input: z.object({ targetId: IdSchema }), output: PostTargetSchema },
  'publishing:cancel': { input: z.object({ targetId: IdSchema }), output: PostTargetSchema },
  'publishing:hostStatus': {
    input: z.undefined(),
    output: z.object({
      kind: z.enum(['none', 'cloudinary']),
      configured: z.boolean(),
      hasSecret: z.boolean()
    })
  },
  'publishing:setCloudinarySecret': {
    input: z.object({ apiSecret: z.string().trim().min(1) }),
    output: z.void()
  },
  'publishing:setInstagramAppSecret': {
    input: z.object({ appSecret: z.string().trim().min(1) }),
    output: z.void()
  },
  /** Marca (o desmarca) una red como publicada a mano. */
  'publishing:markManual': { input: MarkManualSchema, output: z.array(PostTargetSchema) },

  // --- Claude ---
  'ai:status': { input: z.undefined(), output: AiStatusSchema },
  'ai:setApiKey': {
    input: z.object({ apiKey: z.string().trim().min(10) }),
    output: AiStatusSchema
  },
  'ai:clearApiKey': { input: z.undefined(), output: AiStatusSchema },
  /** Verifica la clave contra la API y devuelve los modelos disponibles. */
  'ai:testConnection': { input: z.undefined(), output: z.array(ModelInfoSchema) },
  'ai:usageHistory': { input: z.undefined(), output: z.array(UsageSummarySchema) },
  'ai:conversations:list': { input: z.undefined(), output: z.array(AiConversationSchema) },
  'ai:conversations:create': {
    input: z.object({
      title: z.string().trim().max(120).default(''),
      context: ScreenContextSchema.optional()
    }),
    output: AiConversationSchema
  },
  'ai:conversations:delete': { input: ById, output: z.void() },
  'ai:messages:list': {
    input: z.object({ conversationId: IdSchema }),
    output: z.array(AiMessageSchema)
  },
  /** Envía un mensaje; la respuesta llega por streaming (evento ai:stream) y al final completa. */
  'ai:chat': { input: ChatRequestSchema, output: AiMessageSchema },
  /** Ejecuta una acción con salida estructurada (ideas, guion, adaptar…). */
  'ai:runAction': { input: ActionRequestSchema, output: AiMessageSchema },

  // --- analítica ---
  'analytics:overview': { input: AnalyticsQuerySchema, output: AnalyticsOverviewSchema },
  'analytics:sync': {
    input: z.object({ accountId: IdSchema.optional() }),
    output: z.array(SyncResultSchema)
  },
  'analytics:digest': { input: AnalyticsQuerySchema, output: z.object({ text: z.string() }) },

  // --- vídeo ---
  'video:projects:list': { input: z.undefined(), output: z.array(VideoProjectSchema) },
  'video:projects:create': { input: VideoProjectCreateSchema, output: VideoProjectSchema },
  'video:projects:update': { input: VideoProjectUpdateSchema, output: VideoProjectSchema },
  'video:projects:delete': { input: ById, output: z.void() },
  /** Exporta a MP4 y lo añade a la biblioteca; el progreso llega por video:progress. */
  'video:export': { input: ById, output: MediaAssetSchema },
  /** Transcribe el audio de los clips con Whisper en local y devuelve subtítulos. */
  'video:transcribe': { input: ById, output: z.array(CueSchema) },

  // --- copias de seguridad ---
  'backup:status': { input: z.undefined(), output: BackupStatusSchema },
  /** Abre el selector de carpeta del sistema; null si se cancela. */
  'backup:chooseDir': { input: z.undefined(), output: z.string().nullable() },
  'backup:run': { input: z.undefined(), output: BackupRunResultSchema },
  'backup:list': {
    input: z.object({ dir: z.string().min(1) }),
    output: z.array(SnapshotInfoSchema)
  },
  /** Prepara la restauración y reinicia la app para aplicarla. */
  'backup:restore': {
    input: z.object({ dir: z.string().min(1), snapshot: z.string().min(1) }),
    output: z.void()
  },

  // --- actualizaciones ---
  'updates:state': { input: z.undefined(), output: UpdateStateSchema },
  'updates:check': { input: z.undefined(), output: UpdateStateSchema },
  'updates:download': { input: z.undefined(), output: UpdateStateSchema },
  'updates:install': { input: z.undefined(), output: z.void() },

  // --- análisis de cuentas (Fase 9) ---
  'analysis:profiles:list': { input: z.undefined(), output: z.array(ProfileSchema) },
  'analysis:profiles:create': { input: ProfileCreateSchema, output: ProfileSchema },
  'analysis:profiles:update': { input: ProfileUpdateSchema, output: ProfileSchema },
  'analysis:profiles:delete': { input: ById, output: z.void() },
  'analysis:snapshots:list': {
    input: z.object({ profileId: IdSchema }),
    output: z.array(SnapshotSchema)
  },
  /** Guarda datos revisados por el usuario (de capturas, a mano…). */
  'analysis:snapshots:save': { input: SnapshotCreateSchema, output: SnapshotSchema },
  'analysis:snapshots:delete': { input: ById, output: z.void() },
  /** Abre el selector de imágenes del sistema; lista vacía si se cancela. */
  'analysis:pickScreenshots': { input: z.undefined(), output: z.array(z.string()) },
  /** Claude lee las capturas y devuelve un borrador de datos (no se guarda). */
  'analysis:readScreenshots': {
    input: ReadScreenshotsSchema,
    output: ReadScreenshotsResultSchema
  },
  /** Datos automáticos y gratuitos (YouTube público, Instagram propia conectada). */
  'analysis:refreshAuto': { input: z.object({ profileId: IdSchema }), output: SnapshotSchema },
  'analysis:sources': { input: z.undefined(), output: SourcesStatusSchema },
  'analysis:setYoutubeApiKey': {
    input: z.object({ apiKey: z.string().trim().min(20, 'La clave parece incompleta') }),
    output: SourcesStatusSchema
  },
  'analysis:clearYoutubeApiKey': { input: z.undefined(), output: SourcesStatusSchema },
  'analysis:list': { input: z.object({ profileId: IdSchema }), output: z.array(AnalysisSchema) },
  'analysis:audit': { input: AuditRequestSchema, output: AnalysisSchema },
  'analysis:plan': { input: PlanRequestSchema, output: AnalysisSchema },
  /** Crea borradores en el calendario con las piezas elegidas del plan. */
  'analysis:applyPlan': {
    input: ApplyPlanSchema,
    output: z.object({ analysis: AnalysisSchema, created: z.array(IdSchema) })
  },
  'analysis:delete': { input: ById, output: z.void() }
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
