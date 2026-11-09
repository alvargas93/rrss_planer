import { z } from 'zod'
import { EntityBase, IdSchema } from './common'
import { NETWORKS } from '../connectors/networks'

// ------------------------------------------------------------------ ajustes

/** Precio en dólares por millón de tokens. Editable en ajustes. */
export const ModelPriceSchema = z.object({
  inputPerMTok: z.number().min(0),
  outputPerMTok: z.number().min(0),
  cacheReadPerMTok: z.number().min(0),
  cacheWritePerMTok: z.number().min(0)
})
export type ModelPrice = z.infer<typeof ModelPriceSchema>

export const DEFAULT_MODEL = 'claude-opus-5-5'

/**
 * Precios de partida (verificados 2026-11-06 en la documentación de Anthropic).
 * Si un modelo no está aquí, el coste se estima con el precio del modelo por defecto
 * y se avisa en la interfaz.
 */
export const DEFAULT_PRICING: Record<string, ModelPrice> = {
  'claude-opus-5-5': {
    inputPerMTok: 4,
    outputPerMTok: 20,
    cacheReadPerMTok: 0.2,
    cacheWritePerMTok: 5
  },
  'claude-sonnet-5-5': {
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheReadPerMTok: 0.2,
    cacheWritePerMTok: 2.5
  },
  'claude-haiku-5-5': {
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    cacheReadPerMTok: 0.01,
    cacheWritePerMTok: 0.125
  }
}

export const EffortSchema = z.enum(['low', 'medium', 'high'])
export type Effort = z.infer<typeof EffortSchema>

export const AiSettingsSchema = z.object({
  model: z.string().min(1).default(DEFAULT_MODEL),
  /** Profundidad de razonamiento. Más alto = mejor y más caro/lento. */
  effort: EffortSchema.default('medium'),
  /** Tope mensual en dólares; null = sin límite. */
  monthlyLimitUsd: z.number().min(0).nullable().default(20),
  /** Aviso al alcanzar este porcentaje del tope. */
  warnAtPercent: z.number().int().min(1).max(100).default(80),
  /** Si Claude rechaza por seguridad, reintentar automáticamente con otro modelo. */
  refusalFallback: z.boolean().default(true),
  pricing: z.record(z.string(), ModelPriceSchema).default(() => ({ ...DEFAULT_PRICING }))
})
export type AiSettings = z.infer<typeof AiSettingsSchema>

// ------------------------------------------------------------------ uso y coste

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Coste estimado en dólares de una llamada. Función pura (probada). */
export function estimateCostUsd(usage: TokenUsage, price: ModelPrice): number {
  const perTok = (n: number, perM: number): number => (n * perM) / 1_000_000
  return (
    perTok(usage.inputTokens, price.inputPerMTok) +
    perTok(usage.outputTokens, price.outputPerMTok) +
    perTok(usage.cacheReadTokens, price.cacheReadPerMTok) +
    perTok(usage.cacheWriteTokens, price.cacheWritePerMTok)
  )
}

/** Clave del mes en hora local, YYYY-MM. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export const UsageSummarySchema = z.object({
  month: z.string(),
  calls: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  costUsd: z.number()
})
export type UsageSummary = z.infer<typeof UsageSummarySchema>

export type BudgetState = 'ok' | 'warning' | 'exceeded' | 'unlimited'

/** Decide si se puede llamar a la API con el gasto actual. Pura (probada). */
export function budgetState(
  costUsd: number,
  limitUsd: number | null,
  warnAtPercent: number
): BudgetState {
  if (limitUsd === null) return 'unlimited'
  if (limitUsd <= 0) return 'exceeded'
  if (costUsd >= limitUsd) return 'exceeded'
  if (costUsd >= (limitUsd * warnAtPercent) / 100) return 'warning'
  return 'ok'
}

export const AiStatusSchema = z.object({
  hasKey: z.boolean(),
  /** Últimos 4 caracteres de la clave, para reconocerla sin mostrarla. */
  keyHint: z.string().nullable(),
  encryptionAvailable: z.boolean(),
  model: z.string(),
  modelPriced: z.boolean(),
  usage: UsageSummarySchema,
  limitUsd: z.number().nullable(),
  budget: z.enum(['ok', 'warning', 'exceeded', 'unlimited'])
})
export type AiStatus = z.infer<typeof AiStatusSchema>

export const ModelInfoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  maxInputTokens: z.number().int().nullable(),
  priced: z.boolean()
})
export type ModelInfo = z.infer<typeof ModelInfoSchema>

// ------------------------------------------------------------------ contexto de pantalla

/** Lo que la interfaz cuenta al asistente sobre la pantalla actual. */
export const ScreenContextSchema = z.object({
  screen: z
    .enum([
      'dashboard',
      'ideas',
      'tasks',
      'calendar',
      'composer',
      'settings',
      'assistant',
      'analytics',
      'video',
      'other'
    ])
    .default('other'),
  idea: z
    .object({
      id: IdSchema.optional(),
      title: z.string(),
      notes: z.string(),
      pillar: z.string().nullable()
    })
    .optional(),
  post: z
    .object({
      id: IdSchema.optional(),
      title: z.string(),
      body: z.string(),
      pillar: z.string().nullable(),
      scheduledAt: z.string().nullable(),
      variants: z.array(z.object({ network: z.enum(NETWORKS), kind: z.string(), text: z.string() }))
    })
    .optional(),
  /** Nombres de los pilares de contenido del usuario. */
  pillars: z.array(z.string()).default([]),
  /** Texto libre: resumen de métricas, semana en curso… */
  extra: z.string().max(8000).optional()
})
export type ScreenContext = z.infer<typeof ScreenContextSchema>

// ------------------------------------------------------------------ acciones

export const ACTION_KINDS = [
  'ideas',
  'script',
  'adapt',
  'hashtags',
  'weekly_plan',
  'summary',
  'captions'
] as const
export const ActionKindSchema = z.enum(ACTION_KINDS)
export type ActionKind = z.infer<typeof ActionKindSchema>

export const ACTION_LABELS: Record<ActionKind, string> = {
  ideas: 'Generar ideas',
  script: 'Escribir guion',
  adapt: 'Adaptar a cada red',
  hashtags: 'Sugerir hashtags',
  weekly_plan: 'Plan semanal',
  summary: 'Resumen de métricas',
  captions: 'Subtítulos desde el guion'
}

export const IdeasResultSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string(),
      hook: z.string().describe('Primera frase que engancha'),
      angle: z.string().describe('Por qué funcionaría para esta cuenta'),
      format: z.string().describe('reel, carrusel, historia, vídeo largo, hilo…'),
      pillar: z.string().nullable().describe('Pilar de contenido sugerido, de los del usuario')
    })
  )
})

export const ScriptResultSchema = z.object({
  hook: z.string().describe('Gancho: los primeros 3 segundos'),
  body: z.string().describe('Desarrollo, con saltos de línea entre partes'),
  cta: z.string().describe('Llamada a la acción final'),
  onScreenText: z.array(z.string()).describe('Textos cortos para rotular en pantalla, en orden'),
  estimatedSeconds: z.number().int().describe('Duración aproximada al leerlo en voz alta')
})

export const AdaptResultSchema = z.object({
  adaptations: z.array(
    z.object({
      network: z.enum(NETWORKS),
      text: z.string(),
      notes: z.string().describe('Qué se cambió y por qué, en una frase')
    })
  )
})

export const HashtagsResultSchema = z.object({
  hashtags: z.array(z.string()).describe('Con almohadilla, sin espacios, de más a menos relevante'),
  rationale: z.string().describe('Criterio en una o dos frases')
})

export const WeeklyPlanResultSchema = z.object({
  summary: z.string().describe('Idea general de la semana en una frase'),
  slots: z.array(
    z.object({
      dayOffset: z.number().int().min(0).max(6).describe('0 = lunes de la semana que viene'),
      time: z.string().describe('HH:mm en hora local'),
      network: z.enum(NETWORKS),
      kind: z.string(),
      title: z.string(),
      outline: z.string().describe('De qué va, en dos frases'),
      pillar: z.string().nullable()
    })
  )
})

export const SummaryResultSchema = z.object({
  headline: z.string().describe('Una frase con lo más importante del periodo'),
  highlights: z.array(z.string()).describe('3 a 5 datos concretos con cifras'),
  whatWorked: z.string().describe('Qué tipo de contenido funcionó y por qué'),
  whatToChange: z.string().describe('Qué dejar de hacer o ajustar'),
  nextWeekFocus: z.array(z.string()).describe('2 a 4 acciones concretas para la semana que viene')
})

export const CaptionsResultSchema = z.object({
  cues: z.array(
    z.object({
      start: z.number().describe('Segundo de inicio'),
      end: z.number().describe('Segundo de fin'),
      text: z.string().describe('Texto del subtítulo, máximo 42 caracteres, sin cortar palabras')
    })
  )
})

export const ActionResultSchemas = {
  ideas: IdeasResultSchema,
  script: ScriptResultSchema,
  adapt: AdaptResultSchema,
  hashtags: HashtagsResultSchema,
  weekly_plan: WeeklyPlanResultSchema,
  summary: SummaryResultSchema,
  captions: CaptionsResultSchema
} as const

export type ActionResult<K extends ActionKind = ActionKind> = z.infer<
  (typeof ActionResultSchemas)[K]
>

/** Entrada común de una acción: instrucción opcional del usuario y el contexto. */
export const ActionRequestSchema = z.object({
  conversationId: IdSchema.nullable().default(null),
  kind: ActionKindSchema,
  /** Texto adicional del usuario ("en tono cercano", "para principiantes"…). */
  instruction: z.string().max(4000).default(''),
  /** Redes de destino para adaptar; si vacío, las del post o todas. */
  networks: z.array(z.enum(NETWORKS)).default([]),
  context: ScreenContextSchema.default(() => ScreenContextSchema.parse({}))
})
export type ActionRequest = z.infer<typeof ActionRequestSchema>

// ------------------------------------------------------------------ conversaciones

export const AiConversationSchema = z.object({
  ...EntityBase,
  title: z.string(),
  contextType: z.string(),
  contextId: z.string().nullable()
})
export type AiConversation = z.infer<typeof AiConversationSchema>

export const AiMessageBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('action'),
    kind: ActionKindSchema,
    instruction: z.string(),
    result: z.unknown()
  }),
  z.object({ type: z.literal('error'), message: z.string() })
])
export type AiMessageBlock = z.infer<typeof AiMessageBlockSchema>

export const AiMessageSchema = z.object({
  id: IdSchema,
  conversationId: IdSchema,
  role: z.enum(['user', 'assistant']),
  blocks: z.array(AiMessageBlockSchema),
  model: z.string().nullable(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  costUsd: z.number(),
  createdAt: z.string()
})
export type AiMessage = z.infer<typeof AiMessageSchema>

export const ChatRequestSchema = z.object({
  conversationId: IdSchema.nullable().default(null),
  text: z.string().trim().min(1).max(20_000),
  context: ScreenContextSchema.default(() => ScreenContextSchema.parse({}))
})
export type ChatRequest = z.infer<typeof ChatRequestSchema>

/** Evento de streaming que el proceso principal empuja a la interfaz. */
export const AiStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), conversationId: IdSchema, messageId: IdSchema }),
  z.object({
    type: z.literal('delta'),
    conversationId: IdSchema,
    messageId: IdSchema,
    text: z.string()
  }),
  z.object({ type: z.literal('done'), conversationId: IdSchema, messageId: IdSchema }),
  z.object({
    type: z.literal('error'),
    conversationId: IdSchema,
    messageId: IdSchema,
    message: z.string()
  })
])
export type AiStreamEvent = z.infer<typeof AiStreamEventSchema>
