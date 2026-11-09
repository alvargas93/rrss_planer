import { z } from 'zod'
import { EntityBase, IdSchema } from './common'
import { NETWORKS, POST_KINDS, type Network } from '../connectors/networks'

/**
 * Fase 9 · análisis de cuentas (ADR 0002).
 * Una cuenta analizada es solo una red y un nombre de usuario: no hace falta conectarla.
 * Sus datos llegan por capturas (leídas por Claude y revisadas por el usuario), a mano o,
 * donde es gratis y oficial, de forma automática.
 */

// ------------------------------------------------------------------ cuentas analizadas

/** Quita espacios, la @ inicial y la URL de perfil si se pega entera. */
export function normalizeUsername(raw: string): string {
  let value = raw.trim()
  const url = value.match(/^https?:\/\/[^/]+\/(?:@|in\/|c\/)?([^/?#]+)/i)
  if (url?.[1]) value = url[1]
  return value.replace(/^@+/, '').trim()
}

export const UsernameSchema = z
  .string()
  .transform(normalizeUsername)
  .pipe(z.string().min(1, 'Escribe el nombre de usuario').max(100))

export const ProfileSchema = z.object({
  ...EntityBase,
  network: z.enum(NETWORKS),
  username: z.string(),
  displayName: z.string(),
  /** Si es una cuenta del propio usuario (la principal) o una de referencia. */
  isOwn: z.boolean(),
  /** Cuenta conectada de la que leer datos automáticos (Instagram propia). */
  accountId: IdSchema.nullable(),
  notes: z.string()
})
export type Profile = z.infer<typeof ProfileSchema>

export const ProfileCreateSchema = z.object({
  network: z.enum(NETWORKS),
  username: UsernameSchema,
  displayName: z.string().trim().max(200).default(''),
  isOwn: z.boolean().default(true),
  accountId: IdSchema.nullable().default(null),
  notes: z.string().max(10_000).default('')
})
export type ProfileCreate = z.infer<typeof ProfileCreateSchema>

export const ProfileUpdateSchema = z.object({
  id: IdSchema,
  patch: ProfileCreateSchema.partial()
})

// ------------------------------------------------------------------ datos de una cuenta

/**
 * Datos de una cuenta en un momento dado. El mismo esquema sirve para lo que lee Claude de
 * las capturas, lo que escribe el usuario a mano y lo que llega de las APIs gratuitas.
 * Todo admite null: una captura rara vez trae todos los datos.
 */
export const PostDataSchema = z.object({
  format: z
    .string()
    .describe('Formato tal como se ve: reel, carrusel, foto, historia, vídeo, short, texto…'),
  publishedAt: z
    .string()
    .nullable()
    .describe('Fecha de publicación tal como aparece (o en formato AAAA-MM-DD si se sabe)'),
  caption: z.string().nullable().describe('Texto, título o primera línea visible'),
  views: z.number().nullable(),
  likes: z.number().nullable(),
  comments: z.number().nullable(),
  shares: z.number().nullable(),
  saves: z.number().nullable(),
  url: z.string().nullable()
})
export type PostData = z.infer<typeof PostDataSchema>

export const ProfileDataSchema = z.object({
  displayName: z.string().nullable(),
  bio: z.string().nullable(),
  followers: z.number().nullable(),
  following: z.number().nullable(),
  postsCount: z.number().nullable().describe('Número total de publicaciones de la cuenta'),
  period: z
    .string()
    .nullable()
    .describe('Periodo al que se refieren las estadísticas, p. ej. «últimos 30 días»'),
  metrics: z
    .array(
      z.object({
        label: z.string().describe('Nombre de la métrica tal como aparece: alcance, visitas…'),
        value: z.number().nullable(),
        note: z.string().nullable().describe('Variación o aclaración que acompañe a la cifra')
      })
    )
    .describe('Estadísticas de la cuenta que se vean (alcance, visualizaciones, interacciones…)'),
  posts: z.array(PostDataSchema).describe('Publicaciones visibles con sus cifras'),
  observations: z
    .string()
    .describe('Lo que se ve y no encaja arriba, y cualquier dato dudoso o ilegible')
})
export type ProfileData = z.infer<typeof ProfileDataSchema>

export const EMPTY_PROFILE_DATA: ProfileData = {
  displayName: null,
  bio: null,
  followers: null,
  following: null,
  postsCount: null,
  period: null,
  metrics: [],
  posts: [],
  observations: ''
}

export const SNAPSHOT_SOURCES = ['screenshots', 'manual', 'instagram', 'youtube'] as const
export const SnapshotSourceSchema = z.enum(SNAPSHOT_SOURCES)
export type SnapshotSource = z.infer<typeof SnapshotSourceSchema>

export const SNAPSHOT_SOURCE_LABELS: Record<SnapshotSource, string> = {
  screenshots: 'Capturas',
  manual: 'A mano',
  instagram: 'Instagram (automático)',
  youtube: 'YouTube (automático)'
}

export const SnapshotSchema = z.object({
  ...EntityBase,
  profileId: IdSchema,
  source: SnapshotSourceSchema,
  capturedAt: z.string(),
  data: ProfileDataSchema
})
export type Snapshot = z.infer<typeof SnapshotSchema>

export const SnapshotCreateSchema = z.object({
  profileId: IdSchema,
  source: SnapshotSourceSchema,
  data: ProfileDataSchema
})

/** Formatos de imagen que se aceptan como capturas. */
export const SCREENSHOT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const
export const MAX_SCREENSHOTS = 10

export const ReadScreenshotsSchema = z.object({
  profileId: IdSchema,
  paths: z
    .array(z.string().min(1))
    .min(1, 'Elige al menos una captura')
    .max(MAX_SCREENSHOTS, `Como máximo ${MAX_SCREENSHOTS} capturas cada vez`)
})

export const ReadScreenshotsResultSchema = z.object({
  data: ProfileDataSchema,
  costUsd: z.number()
})

// ------------------------------------------------------------------ fuentes automáticas

export type AutoSource = 'instagram' | 'youtube'

/**
 * Qué fuente automática y gratuita tiene una cuenta, o null si va con capturas.
 * Instagram: solo la cuenta propia conectada (la API pública de otras cuentas exige Facebook
 * Login). YouTube: datos públicos de cualquier canal con una clave de API.
 */
export function autoSourceFor(profile: {
  network: Network
  accountId: string | null
}): AutoSource | null {
  if (profile.network === 'youtube') return 'youtube'
  if (profile.network === 'instagram' && profile.accountId) return 'instagram'
  return null
}

export const SourcesStatusSchema = z.object({
  youtubeApiKey: z.boolean()
})

// ------------------------------------------------------------------ análisis y plan

export const AuditResultSchema = z.object({
  headline: z.string().describe('Una frase con el diagnóstico principal'),
  strengths: z.array(z.string()).describe('2 a 4 puntos fuertes, con cifras si las hay'),
  weaknesses: z.array(z.string()).describe('2 a 4 puntos débiles o riesgos'),
  bestFormats: z
    .array(z.object({ format: z.string(), why: z.string() }))
    .describe('Formatos que mejor funcionan, del mejor al peor'),
  topPosts: z
    .array(z.object({ post: z.string(), why: z.string() }))
    .describe('Publicaciones que más destacan y por qué'),
  recommendations: z.array(z.string()).describe('3 a 6 acciones concretas y realistas'),
  suggestedFrequency: z
    .array(
      z.object({
        network: z.enum(NETWORKS),
        kind: z.enum(POST_KINDS),
        perWeek: z.number().describe('Piezas por semana recomendadas')
      })
    )
    .describe('Ritmo de publicación recomendado por formato'),
  dataGaps: z.array(z.string()).describe('Datos que faltan para afinar el análisis')
})
export type AuditResult = z.infer<typeof AuditResultSchema>

export const PlanItemSchema = z.object({
  dayOffset: z.number().int().describe('Días desde la fecha de inicio (0 = el primer día)'),
  time: z.string().describe('Hora HH:mm en hora local'),
  network: z.enum(NETWORKS),
  kind: z.enum(POST_KINDS),
  title: z.string().describe('Título interno corto'),
  hook: z.string().describe('Primera frase o primer segundo, literal'),
  outline: z.string().describe('De qué va y cómo se desarrolla, en 2 o 3 frases'),
  caption: z.string().describe('Texto listo para pegar en la red, respetando sus límites'),
  production: z
    .string()
    .describe('Cómo montarlo: planos, diapositivas o historias, con lo mínimo necesario'),
  pillar: z.string().nullable()
})
export type PlanItem = z.infer<typeof PlanItemSchema>

export const PlanResultSchema = z.object({
  summary: z.string().describe('Idea general del plan en una o dos frases'),
  items: z.array(PlanItemSchema)
})
export type PlanResult = z.infer<typeof PlanResultSchema>

export const PLAN_WEEKS = [1, 2, 4] as const

/** Fecha local AAAA-MM-DD. */
export const DayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD')

export const PlanRequestSchema = z.object({
  profileId: IdSchema,
  startDate: DayKeySchema,
  weeks: z.union([z.literal(1), z.literal(2), z.literal(4)]).default(2),
  networks: z.array(z.enum(NETWORKS)).min(1, 'Elige al menos una red'),
  kinds: z.array(z.enum(POST_KINDS)).min(1, 'Elige al menos un formato'),
  perWeek: z.number().int().min(1).max(21).default(5),
  instruction: z.string().max(4000).default('')
})
export type PlanRequest = z.infer<typeof PlanRequestSchema>

export const AuditRequestSchema = z.object({
  profileId: IdSchema,
  instruction: z.string().max(4000).default('')
})

const AnalysisBase = {
  ...EntityBase,
  profileId: IdSchema,
  snapshotId: IdSchema.nullable(),
  instruction: z.string(),
  model: z.string(),
  costUsd: z.number()
}

export const AnalysisSchema = z.discriminatedUnion('kind', [
  z.object({ ...AnalysisBase, kind: z.literal('audit'), result: AuditResultSchema }),
  z.object({
    ...AnalysisBase,
    kind: z.literal('plan'),
    result: PlanResultSchema,
    request: PlanRequestSchema,
    /** Índice de la pieza → id del borrador creado en el calendario. */
    applied: z.record(z.string(), z.string())
  })
])
export type Analysis = z.infer<typeof AnalysisSchema>

export const ApplyPlanSchema = z.object({
  analysisId: IdSchema,
  itemIndexes: z.array(z.number().int().min(0)).min(1, 'Elige al menos una pieza')
})

// ------------------------------------------------------------------ fechas del plan

/** Próximo lunes en AAAA-MM-DD local (si hoy es lunes, el de la semana que viene). */
export function nextMondayKey(today: Date): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const offset = (8 - d.getDay()) % 7 || 7
  d.setDate(d.getDate() + offset)
  return dayKey(d)
}

export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Fecha y hora local de una pieza del plan. Si la hora no es válida se usa las 10:00; si el
 * día cae fuera del plan se ajusta al último día. Pura (probada).
 */
export function planItemDate(
  startDate: string,
  dayOffset: number,
  time: string,
  totalDays: number
): Date {
  const [y, m, d] = startDate.split('-').map(Number)
  const day = Math.min(Math.max(0, Math.round(dayOffset)), Math.max(0, totalDays - 1))
  const match = time.match(/^(\d{1,2}):(\d{2})$/)
  let hours = 10
  let minutes = 0
  if (match) {
    const h = Number(match[1])
    const min = Number(match[2])
    if (h >= 0 && h < 24 && min >= 0 && min < 60) {
      hours = h
      minutes = min
    }
  }
  return new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + day, hours, minutes, 0, 0)
}

/**
 * Convierte lo que se escribe en un campo de cifra: «1.234» → 1234, «1,5» → 1.5, vacío → null.
 * Devuelve 'invalid' si no es un número. Pura (probada).
 */
export function parseCountInput(raw: string): number | null | 'invalid' {
  const text = raw.trim().replace(/\s/g, '')
  if (!text) return null
  const normalized = text.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const value = Number(normalized)
  return Number.isFinite(value) ? value : 'invalid'
}
