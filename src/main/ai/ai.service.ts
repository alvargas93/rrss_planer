import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import {
  ActionResultSchemas,
  DEFAULT_MODEL,
  DEFAULT_PRICING,
  budgetState,
  estimateCostUsd,
  monthKey,
  type ActionKind,
  type ActionRequest,
  type AiMessage,
  type AiMessageBlock,
  type AiStatus,
  type AiStreamEvent,
  type ChatRequest,
  type ModelInfo,
  type ModelPrice,
  type ScreenContext,
  type TokenUsage
} from '@shared/domain/ai'
import { AppError } from '@shared/domain/errors'
import type { AiRepository } from '../repositories/ai.repository'
import type { SettingsService } from '../services/settings.service'
import { SECRET_KEYS, type SecretStore } from '../secrets/secrets.service'
import { newId } from '../db/helpers'
import { createLogger } from '../log'
import { buildActionPrompt, buildSystemPrompt, describeActionRequest } from './prompts'

const log = createLogger('ai')

/** Beta de reintento automático en otro modelo si Claude declina por seguridad. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
const CHAT_MAX_TOKENS = 4096
const ACTION_MAX_TOKENS = 8000
const HISTORY_LIMIT = 24

export type ClientFactory = (apiKey: string) => Anthropic

export interface AiServiceOptions {
  repo: AiRepository
  secrets: SecretStore
  settings: SettingsService
  /** Empuja eventos de streaming a la interfaz. */
  emit: (event: AiStreamEvent) => void
  /** Cómo construir el cliente; se inyecta para poder probar sin red. */
  clientFactory?: ClientFactory
  encryptionAvailable?: () => boolean
}

function usageFrom(message: { usage: Anthropic.Beta.BetaUsage }): TokenUsage {
  return {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0
  }
}

/** Traduce errores del SDK a errores de la app con mensajes claros. */
function translateError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof Anthropic.AuthenticationError) {
    return new AppError('UNAUTHORIZED', 'La clave de API no es válida o ha sido revocada.')
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AppError(
      'RATE_LIMITED',
      'Anthropic ha limitado las peticiones. Espera un momento y vuelve a intentarlo.'
    )
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AppError('VALIDATION', `La API rechazó la petición: ${error.message}`)
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AppError(
      'EXTERNAL_API',
      'No hay conexión con la API de Anthropic. Comprueba tu red.'
    )
  }
  if (error instanceof Anthropic.APIError) {
    const billing = error.status === 402
    return new AppError(
      'EXTERNAL_API',
      billing
        ? 'Tu cuenta de Anthropic no tiene saldo o método de pago.'
        : `Error de la API de Anthropic (${error.status ?? '?'}): ${error.message}`
    )
  }
  return AppError.from(error)
}

export class AiService {
  private readonly repo: AiRepository
  private readonly secrets: SecretStore
  private readonly settings: SettingsService
  private readonly emit: (event: AiStreamEvent) => void
  private readonly clientFactory: ClientFactory
  private readonly encryptionAvailable: () => boolean

  constructor(options: AiServiceOptions) {
    this.repo = options.repo
    this.secrets = options.secrets
    this.settings = options.settings
    this.emit = options.emit
    this.clientFactory = options.clientFactory ?? ((apiKey) => new Anthropic({ apiKey }))
    this.encryptionAvailable = options.encryptionAvailable ?? (() => true)
  }

  // ----------------------------------------------------------- configuración

  status(now = new Date()): AiStatus {
    const ai = this.settings.get().ai
    const usage = this.repo.usageForMonth(monthKey(now))
    const key = this.secrets.has(SECRET_KEYS.anthropicApiKey) ? this.readKey() : null
    return {
      hasKey: !!key,
      keyHint: key ? key.slice(-4) : null,
      encryptionAvailable: this.encryptionAvailable(),
      model: ai.model,
      modelPriced: ai.model in ai.pricing,
      usage,
      limitUsd: ai.monthlyLimitUsd,
      budget: budgetState(usage.costUsd, ai.monthlyLimitUsd, ai.warnAtPercent)
    }
  }

  setApiKey(apiKey: string): AiStatus {
    this.secrets.set(SECRET_KEYS.anthropicApiKey, apiKey.trim())
    log.info('Clave de API guardada (cifrada)')
    return this.status()
  }

  clearApiKey(): AiStatus {
    this.secrets.delete(SECRET_KEYS.anthropicApiKey)
    return this.status()
  }

  async testConnection(): Promise<ModelInfo[]> {
    const client = this.client()
    const pricing = this.settings.get().ai.pricing
    try {
      const models: ModelInfo[] = []
      for await (const model of client.models.list({ limit: 50 })) {
        models.push({
          id: model.id,
          displayName: model.display_name,
          maxInputTokens: model.max_input_tokens ?? null,
          priced: model.id in pricing
        })
        if (models.length >= 50) break
      }
      return models
    } catch (error) {
      throw translateError(error)
    }
  }

  usageHistory(): ReturnType<AiRepository['usageHistory']> {
    return this.repo.usageHistory()
  }

  // ----------------------------------------------------------- conversaciones

  listConversations(): ReturnType<AiRepository['listConversations']> {
    return this.repo.listConversations()
  }

  createConversation(
    title: string,
    context?: ScreenContext
  ): ReturnType<AiRepository['createConversation']> {
    const contextType = context?.post ? 'post' : context?.idea ? 'idea' : 'screen'
    const contextId = context?.post?.id ?? context?.idea?.id ?? null
    return this.repo.createConversation({ title, contextType, contextId })
  }

  deleteConversation(id: string): void {
    this.repo.deleteConversation(id)
  }

  listMessages(conversationId: string): AiMessage[] {
    return this.repo.listMessages(conversationId)
  }

  // ----------------------------------------------------------- chat

  async chat(request: ChatRequest): Promise<AiMessage> {
    const client = this.client()
    this.assertBudget()
    const ai = this.settings.get().ai

    const conversationId =
      request.conversationId ??
      this.createConversation(request.text.slice(0, 60), request.context).id
    this.repo.addMessage({
      conversationId,
      role: 'user',
      blocks: [{ type: 'text', text: request.text }]
    })

    const history = this.historyFor(conversationId)
    const system = buildSystemPrompt(request.context)
    const messageId = newId()
    this.emit({ type: 'start', conversationId, messageId })

    try {
      const stream = client.beta.messages.stream({
        model: ai.model,
        max_tokens: CHAT_MAX_TOKENS,
        system: [
          { type: 'text', text: system.stable, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: system.dynamic }
        ],
        messages: history,
        output_config: { effort: ai.effort },
        ...(ai.refusalFallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {})
      })
      stream.on('text', (delta) =>
        this.emit({ type: 'delta', conversationId, messageId, text: delta })
      )
      const final = await stream.finalMessage()

      const text = final.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      const blocks: AiMessageBlock[] =
        final.stop_reason === 'refusal'
          ? [{ type: 'error', message: this.refusalMessage(final.stop_details?.category) }]
          : [{ type: 'text', text }]

      const saved = this.record(conversationId, messageId, 'chat', final, blocks)
      this.emit({ type: 'done', conversationId, messageId })
      return saved
    } catch (error) {
      const appError = translateError(error)
      log.error(`Fallo en chat: ${appError.message}`)
      this.emit({ type: 'error', conversationId, messageId, message: appError.message })
      throw appError
    }
  }

  // ----------------------------------------------------------- acciones estructuradas

  async runAction(request: ActionRequest): Promise<AiMessage> {
    const client = this.client()
    this.assertBudget()
    const ai = this.settings.get().ai
    const label = describeActionRequest(request.kind, request.instruction)

    const conversationId =
      request.conversationId ?? this.createConversation(label, request.context).id
    this.repo.addMessage({ conversationId, role: 'user', blocks: [{ type: 'text', text: label }] })

    const system = buildSystemPrompt(request.context)
    const prompt = buildActionPrompt(
      request.kind,
      request.instruction,
      request.networks,
      request.context
    )
    const schema = ActionResultSchemas[request.kind]
    const messageId = newId()

    try {
      const response = await client.beta.messages.parse({
        model: ai.model,
        max_tokens: ACTION_MAX_TOKENS,
        system: [
          { type: 'text', text: system.stable, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: system.dynamic }
        ],
        messages: [{ role: 'user', content: prompt }],
        output_config: { effort: ai.effort, format: betaZodOutputFormat(schema) },
        ...(ai.refusalFallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {})
      })

      let blocks: AiMessageBlock[]
      if (response.stop_reason === 'refusal') {
        blocks = [{ type: 'error', message: this.refusalMessage(response.stop_details?.category) }]
      } else if (!response.parsed_output) {
        blocks = [
          {
            type: 'error',
            message: 'La respuesta no tenía el formato esperado. Vuelve a intentarlo.'
          }
        ]
      } else {
        blocks = [
          {
            type: 'action',
            kind: request.kind,
            instruction: request.instruction,
            result: response.parsed_output
          }
        ]
      }
      return this.record(conversationId, messageId, request.kind, response, blocks)
    } catch (error) {
      const appError = translateError(error)
      log.error(`Fallo en acción ${request.kind}: ${appError.message}`)
      throw appError
    }
  }

  // ----------------------------------------------------------- privados

  private client(): Anthropic {
    const key = this.readKey()
    if (!key) {
      throw new AppError(
        'NOT_CONFIGURED',
        'Falta la clave de API de Anthropic. Añádela en Ajustes → Claude.'
      )
    }
    return this.clientFactory(key)
  }

  private readKey(): string | null {
    return this.secrets.get(SECRET_KEYS.anthropicApiKey)
  }

  private assertBudget(): void {
    const status = this.status()
    if (status.budget === 'exceeded') {
      throw new AppError(
        'BUDGET_EXCEEDED',
        `Has alcanzado el límite mensual de ${status.limitUsd} $ (gastado: ${status.usage.costUsd.toFixed(2)} $). Súbelo en Ajustes → Claude si quieres seguir.`
      )
    }
  }

  private priceFor(model: string): ModelPrice {
    const ai = this.settings.get().ai
    return ai.pricing[model] ?? ai.pricing[ai.model] ?? DEFAULT_PRICING[DEFAULT_MODEL]!
  }

  private refusalMessage(category: string | null | undefined): string {
    return `Claude ha declinado responder a esto por sus políticas de seguridad${category ? ` (${category})` : ''}. Prueba a reformularlo.`
  }

  /** Guarda el mensaje del asistente y la fila de uso con su coste. */
  private record(
    conversationId: string,
    messageId: string,
    kind: ActionKind | 'chat',
    response: { model: string; usage: Anthropic.Beta.BetaUsage },
    blocks: AiMessageBlock[]
  ): AiMessage {
    const usage = usageFrom(response)
    const costUsd = estimateCostUsd(usage, this.priceFor(response.model))
    this.repo.addUsage({ ...usage, model: response.model, kind, costUsd })
    return this.repo.addMessage({
      id: messageId,
      conversationId,
      role: 'assistant',
      blocks,
      model: response.model,
      usage,
      costUsd
    })
  }

  /** Convierte el historial guardado al formato de la API (solo texto). */
  private historyFor(conversationId: string): Anthropic.Beta.BetaMessageParam[] {
    const messages = this.repo.listMessages(conversationId).slice(-HISTORY_LIMIT)
    const params: Anthropic.Beta.BetaMessageParam[] = []
    for (const message of messages) {
      const text = message.blocks
        .map((b) => {
          if (b.type === 'text') return b.text
          if (b.type === 'action') return `[Resultado de "${b.kind}"]\n${JSON.stringify(b.result)}`
          return ''
        })
        .filter(Boolean)
        .join('\n\n')
      if (!text) continue
      params.push({ role: message.role, content: text })
    }
    // La API exige empezar por un mensaje de usuario.
    while (params.length > 0 && params[0]?.role !== 'user') params.shift()
    return params
  }
}
