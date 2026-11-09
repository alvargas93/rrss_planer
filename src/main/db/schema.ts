import { integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Esquema de la base de datos (Drizzle). Cada fase añade sus tablas aquí y genera
 * una migración con `npm run db:generate`. Las migraciones generadas viven en /drizzle
 * y se aplican al arrancar la app.
 *
 * Convenciones (ver docs/PLAN.md §5): ids UUID v7 en texto, fechas ISO 8601 UTC,
 * `deleted_at` para borrado lógico, JSON en columnas de texto.
 */

const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
}

const softDelete = {
  deletedAt: text('deleted_at')
}

// ---------------------------------------------------------------- Fase 1

/** Ajustes de la app, una fila por sección (appearance, general, ai…). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at').notNull()
})

/** Secretos cifrados con safeStorage. El valor en claro nunca toca el disco. */
export const secrets = sqliteTable('secrets', {
  key: text('key').primaryKey(),
  /** Blob cifrado, codificado en base64. */
  ciphertext: text('ciphertext').notNull(),
  updatedAt: text('updated_at').notNull()
})

// ---------------------------------------------------------------- Fase 2

/** Pilares de contenido: los temas sobre los que gira la cuenta. */
export const contentPillars = sqliteTable('content_pillars', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  /** Color en hexadecimal (#rrggbb), elegido de una paleta propia. */
  color: text('color').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
  ...softDelete
})

/** Banco de ideas. */
export const ideas = sqliteTable('ideas', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  notes: text('notes').notNull().default(''),
  pillarId: text('pillar_id').references(() => contentPillars.id, { onDelete: 'set null' }),
  /** inbox | maturing | ready | used | discarded */
  status: text('status').notNull().default('inbox'),
  source: text('source').notNull().default(''),
  tagsJson: text('tags_json').notNull().default('[]'),
  ...timestamps,
  ...softDelete
})

/** Publicación "madre": un contenido que luego se adapta a cada red. */
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  /** Texto base del que parten las variantes. */
  body: text('body').notNull().default(''),
  pillarId: text('pillar_id').references(() => contentPillars.id, { onDelete: 'set null' }),
  ideaId: text('idea_id').references(() => ideas.id, { onDelete: 'set null' }),
  /** draft | scheduled | publishing | published | partial | failed | cancelled */
  status: text('status').notNull().default('draft'),
  scheduledAt: text('scheduled_at'),
  notes: text('notes').notNull().default(''),
  ...timestamps,
  ...softDelete
})

/** Adaptación de una publicación a una red concreta. */
export const postVariants = sqliteTable('post_variants', {
  id: text('id').primaryKey(),
  postId: text('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  /** instagram | linkedin | x | youtube */
  network: text('network').notNull(),
  /** feed | carousel | reel | story | short | video | article | thread */
  kind: text('kind').notNull(),
  text: text('text').notNull().default(''),
  hashtagsJson: text('hashtags_json').notNull().default('[]'),
  /** Campos propios de la red: título de YouTube, visibilidad, textos alternativos… */
  extraJson: text('extra_json').notNull().default('{}'),
  ...timestamps
})

/** Tareas del tablero y la lista. */
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  /** todo | doing | done */
  status: text('status').notNull().default('todo'),
  /** low | medium | high */
  priority: text('priority').notNull().default('medium'),
  dueAt: text('due_at'),
  ideaId: text('idea_id').references(() => ideas.id, { onDelete: 'set null' }),
  postId: text('post_id').references(() => posts.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
  completedAt: text('completed_at'),
  ...timestamps,
  ...softDelete
})

/** Archivos de imagen y vídeo copiados a la carpeta de medios de la app. */
export const mediaAssets = sqliteTable('media_assets', {
  id: text('id').primaryKey(),
  /** Nombre de fichero dentro de la carpeta de medios (no una ruta absoluta). */
  fileName: text('file_name').notNull(),
  originalName: text('original_name').notNull(),
  /** image | video */
  kind: text('kind').notNull(),
  mime: text('mime').notNull(),
  width: integer('width'),
  height: integer('height'),
  durationMs: integer('duration_ms'),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256').notNull(),
  altText: text('alt_text').notNull().default(''),
  derivedFrom: text('derived_from'),
  /** Miniatura JPEG (vídeos), nombre dentro de la carpeta de medios. */
  thumbFileName: text('thumb_file_name'),
  /** Metadatos técnicos (códec, fps, audio) en JSON. */
  probeJson: text('probe_json').notNull().default('{}'),
  ...timestamps,
  ...softDelete
})

// ---------------------------------------------------------------- Fase 3

/** Hilos del asistente. */
export const aiConversations = sqliteTable('ai_conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  /** screen | idea | post | account */
  contextType: text('context_type').notNull().default('screen'),
  contextId: text('context_id'),
  ...timestamps,
  ...softDelete
})

/** Mensajes de cada hilo. `content_json` guarda bloques: texto o resultado de acción. */
export const aiMessages = sqliteTable('ai_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => aiConversations.id, { onDelete: 'cascade' }),
  /** user | assistant */
  role: text('role').notNull(),
  contentJson: text('content_json').notNull(),
  model: text('model'),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0),
  createdAt: text('created_at').notNull()
})

/** Una fila por llamada a la API, para el contador de uso y el límite mensual. */
export const aiUsage = sqliteTable('ai_usage', {
  id: text('id').primaryKey(),
  /** YYYY-MM en hora local, para agrupar rápido. */
  month: text('month').notNull(),
  model: text('model').notNull(),
  /** chat | ideas | script | adapt | hashtags | weekly_plan | summary | captions */
  kind: text('kind').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
  costUsd: real('cost_usd').notNull(),
  createdAt: text('created_at').notNull()
})

// ---------------------------------------------------------------- Fase 4

/** Cuentas de redes conectadas. El token vive cifrado en `secrets` (clave `secretKey`). */
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  /** instagram | linkedin | x | youtube */
  network: text('network').notNull(),
  /** Id de la cuenta en la red (p. ej. IG user id). */
  externalId: text('external_id').notNull(),
  username: text('username').notNull(),
  displayName: text('display_name').notNull().default(''),
  avatarUrl: text('avatar_url'),
  /** business | creator | personal | unknown */
  accountType: text('account_type').notNull().default('unknown'),
  /** connected | expiring | expired | revoked | error */
  status: text('status').notNull().default('connected'),
  scopesJson: text('scopes_json').notNull().default('[]'),
  tokenExpiresAt: text('token_expires_at'),
  tokenRefreshedAt: text('token_refreshed_at'),
  secretKey: text('secret_key').notNull(),
  lastError: text('last_error'),
  /** Datos extra de la red (followers_count, media_count…). */
  metaJson: text('meta_json').notNull().default('{}'),
  ...timestamps,
  ...softDelete
})

/** A qué cuenta va cada variante de una publicación y en qué estado está. */
export const postTargets = sqliteTable('post_targets', {
  id: text('id').primaryKey(),
  postId: text('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  variantId: text('variant_id')
    .notNull()
    .references(() => postVariants.id, { onDelete: 'cascade' }),
  accountId: text('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  network: text('network').notNull(),
  /** api | manual */
  mode: text('mode').notNull().default('api'),
  /** pending | queued | publishing | published | failed | manual_notified | cancelled */
  status: text('status').notNull().default('pending'),
  scheduledAt: text('scheduled_at'),
  externalPostId: text('external_post_id'),
  externalUrl: text('external_url'),
  publishedAt: text('published_at'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  nextAttemptAt: text('next_attempt_at'),
  ...timestamps
})

// ---------------------------------------------------------------- Fase 5

/**
 * Métricas por día y por publicación. Una fila por (cuenta, ámbito, medio, métrica, día).
 * `scope` account: métrica diaria de la cuenta (reach, views, seguidores…).
 * `scope` media: valor acumulado de una publicación en la fecha de captura.
 */
export const metricsSnapshots = sqliteTable(
  'metrics_snapshots',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** account | media */
    scope: text('scope').notNull(),
    /** Id del medio en la red (solo scope media). Cadena vacía para la cuenta. */
    externalMediaId: text('external_media_id').notNull().default(''),
    metric: text('metric').notNull(),
    /** Día al que se refiere el valor, YYYY-MM-DD (hora local). */
    day: text('day').notNull(),
    value: real('value').notNull(),
    capturedAt: text('captured_at').notNull()
  },
  (table) => [
    uniqueIndex('metrics_unique').on(
      table.accountId,
      table.scope,
      table.externalMediaId,
      table.metric,
      table.day
    )
  ]
)

/** Publicaciones recientes de la cuenta leídas de la red (incluye las hechas fuera de la app). */
export const remoteMedia = sqliteTable(
  'remote_media',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    /** IMAGE | VIDEO | CAROUSEL_ALBUM */
    mediaType: text('media_type').notNull().default(''),
    /** FEED | REELS | STORY | AD */
    productType: text('product_type').notNull().default(''),
    caption: text('caption').notNull().default(''),
    permalink: text('permalink'),
    thumbnailUrl: text('thumbnail_url'),
    publishedAt: text('published_at').notNull(),
    likeCount: integer('like_count').notNull().default(0),
    commentsCount: integer('comments_count').notNull().default(0),
    /** Id del post local si lo publicó la app (para enlazarlo). */
    postId: text('post_id'),
    ...timestamps
  },
  (table) => [uniqueIndex('remote_media_unique').on(table.accountId, table.externalId)]
)

/** Registro de sincronizaciones de métricas por cuenta. */
export const analyticsSyncs = sqliteTable('analytics_syncs', {
  accountId: text('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  lastSyncAt: text('last_sync_at').notNull(),
  lastError: text('last_error'),
  /** Métricas que la red rechazó la última vez (p. ej. por pocos seguidores). */
  unavailableJson: text('unavailable_json').notNull().default('[]')
})

// ---------------------------------------------------------------- Fase 6

/** Proyectos del editor de vídeo. La línea de tiempo (clips, subtítulos) va en JSON. */
export const videoProjects = sqliteTable('video_projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** 9:16 | 1:1 | 16:9 */
  format: text('format').notNull().default('9:16'),
  /** crop | blur | black */
  fit: text('fit').notNull().default('crop'),
  timelineJson: text('timeline_json').notNull().default('{}'),
  lastExportMediaId: text('last_export_media_id').references(() => mediaAssets.id, {
    onDelete: 'set null'
  }),
  ...timestamps,
  ...softDelete
})

/** Medios adjuntos a una publicación, con orden. */
export const postMedia = sqliteTable(
  'post_media',
  {
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    mediaId: text('media_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0)
  },
  (table) => [primaryKey({ columns: [table.postId, table.mediaId] })]
)
