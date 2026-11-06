import { describe, expect, it, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import {
  ActionResultSchemas,
  DEFAULT_PRICING,
  budgetState,
  estimateCostUsd,
  monthKey,
  ScreenContextSchema,
  type AiConversation,
  type AiMessage,
  type AiStreamEvent,
  type UsageSummary
} from '@shared/domain/ai'
import { AppError } from '@shared/domain/errors'
import { buildActionPrompt, buildSystemPrompt, describeContext } from '@main/ai/prompts'
import { AiService, type ClientFactory } from '@main/ai/ai.service'
import type { AiRepository, MessageCreate, UsageCreate } from '@main/repositories/ai.repository'
import { SettingsService } from '@main/services/settings.service'
import { InMemorySettingsRepository } from '@main/repositories/settings.repository'
import { InMemorySecretStore, SECRET_KEYS } from '@main/secrets/secrets.service'

// ------------------------------------------------------------- funciones puras

describe('coste y presupuesto', () => {
  it('estima el coste con los cuatro tipos de token', () => {
    const price = DEFAULT_PRICING['claude-opus-5-5']!
    const cost = estimateCostUsd(
      {
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        cacheReadTokens: 500_000,
        cacheWriteTokens: 0
      },
      price
    )
    expect(cost).toBeCloseTo(4 + 2 + 0.1, 6)
  })

  it('clasifica el estado del presupuesto', () => {
    expect(budgetState(0, null, 80)).toBe('unlimited')
    expect(budgetState(5, 20, 80)).toBe('ok')
    expect(budgetState(16, 20, 80)).toBe('warning')
    expect(budgetState(20, 20, 80)).toBe('exceeded')
    expect(budgetState(0, 0, 80)).toBe('exceeded')
  })

  it('genera la clave de mes en hora local', () => {
    expect(monthKey(new Date(2026, 0, 5))).toBe('2026-01')
    expect(monthKey(new Date(2026, 10, 30))).toBe('2026-11')
  })
})

describe('prompts', () => {
  it('describe el contexto de una publicación con sus versiones', () => {
    const ctx = ScreenContextSchema.parse({
      screen: 'composer',
      pillars: ['Educación', 'Humor'],
      post: {
        title: 'Reel 1',
        body: 'Texto base',
        pillar: 'Educación',
        scheduledAt: null,
        variants: [{ network: 'instagram', kind: 'reel', text: 'Versión IG' }]
      }
    })
    const text = describeContext(ctx)
    expect(text).toContain('Compositor')
    expect(text).toContain('Educación, Humor')
    expect(text).toContain('Instagram (reel): Versión IG')
  })

  it('el prompt de sistema separa la parte estable de la dinámica', () => {
    const { stable, dynamic } = buildSystemPrompt(ScreenContextSchema.parse({ screen: 'ideas' }))
    expect(stable).toContain('nunca publicas')
    expect(stable).toContain('Instagram: hasta 2200')
    expect(dynamic).toContain('Pantalla actual: Ideas')
  })

  it('la acción de adaptar nombra las redes y añade las indicaciones', () => {
    const prompt = buildActionPrompt(
      'adapt',
      'tono cercano',
      ['x', 'linkedin'],
      ScreenContextSchema.parse({})
    )
    expect(prompt).toContain('X, LinkedIn')
    expect(prompt).toContain('tono cercano')
    expect(prompt).not.toContain('Instagram, LinkedIn, X, YouTube')
  })
})

// ------------------------------------------------------------- servicio con cliente falso

class FakeAiRepository {
  conversations: AiConversation[] = []
  messages: AiMessage[] = []
  usage: UsageCreate[] = []

  listConversations(): AiConversation[] {
    return this.conversations
  }
  createConversation(input: {
    title: string
    contextType?: string
    contextId?: string | null
  }): AiConversation {
    const c: AiConversation = {
      id: `c${this.conversations.length + 1}`,
      title: input.title,
      contextType: input.contextType ?? 'screen',
      contextId: input.contextId ?? null,
      createdAt: 'now',
      updatedAt: 'now'
    }
    this.conversations.push(c)
    return c
  }
  deleteConversation(id: string): void {
    this.conversations = this.conversations.filter((c) => c.id !== id)
  }
  listMessages(conversationId: string): AiMessage[] {
    return this.messages.filter((m) => m.conversationId === conversationId)
  }
  addMessage(input: MessageCreate): AiMessage {
    const m: AiMessage = {
      id: input.id ?? `m${this.messages.length + 1}`,
      conversationId: input.conversationId,
      role: input.role,
      blocks: input.blocks,
      model: input.model ?? null,
      inputTokens: input.usage?.inputTokens ?? 0,
      outputTokens: input.usage?.outputTokens ?? 0,
      costUsd: input.costUsd ?? 0,
      createdAt: `t${this.messages.length + 1}`
    }
    this.messages.push(m)
    return m
  }
  addUsage(input: UsageCreate): void {
    this.usage.push(input)
  }
  usageForMonth(month: string): UsageSummary {
    return {
      month,
      calls: this.usage.length,
      inputTokens: this.usage.reduce((a, u) => a + u.inputTokens, 0),
      outputTokens: this.usage.reduce((a, u) => a + u.outputTokens, 0),
      costUsd: this.usage.reduce((a, u) => a + u.costUsd, 0)
    }
  }
  usageHistory(): UsageSummary[] {
    return [this.usageForMonth('2026-11')]
  }
}

const usage = {
  input_tokens: 1000,
  output_tokens: 500,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0
} as unknown as Anthropic.Beta.BetaUsage

/** Cliente falso: imita stream() y parse() del SDK sin red. */
function fakeClient(
  options: { text?: string; parsed?: unknown; refusal?: boolean } = {}
): Anthropic {
  const text = options.text ?? 'Hola desde el modelo'
  const stream = {
    on: (event: string, cb: (delta: string) => void) => {
      if (event === 'text') for (const part of text.split(' ')) cb(part + ' ')
      return stream
    },
    finalMessage: async () => ({
      model: 'claude-opus-5-5',
      stop_reason: options.refusal ? 'refusal' : 'end_turn',
      stop_details: options.refusal ? { type: 'refusal', category: 'cyber' } : null,
      content: [{ type: 'text', text }],
      usage
    })
  }
  return {
    beta: {
      messages: {
        stream: vi.fn(() => stream),
        parse: vi.fn(async () => ({
          model: 'claude-opus-5-5',
          stop_reason: 'end_turn',
          stop_details: null,
          parsed_output: options.parsed ?? null,
          content: [],
          usage
        }))
      }
    },
    models: { list: vi.fn() }
  } as unknown as Anthropic
}

function setup(options: { key?: boolean; client?: Anthropic; limit?: number | null } = {}): {
  repo: FakeAiRepository
  service: AiService
  events: AiStreamEvent[]
  client: Anthropic
  settings: SettingsService
} {
  const repo = new FakeAiRepository()
  const secrets = new InMemorySecretStore()
  if (options.key !== false) secrets.set(SECRET_KEYS.anthropicApiKey, 'sk-ant-test-1234')
  const settings = new SettingsService(new InMemorySettingsRepository())
  if (options.limit !== undefined) settings.update({ ai: { monthlyLimitUsd: options.limit } })
  const events: AiStreamEvent[] = []
  const client = options.client ?? fakeClient()
  const clientFactory: ClientFactory = () => client
  const service = new AiService({
    repo: repo as unknown as AiRepository,
    secrets,
    settings,
    emit: (e) => events.push(e),
    clientFactory
  })
  return { repo, service, events, client, settings }
}

describe('AiService', () => {
  it('sin clave: estado sin configurar y el chat falla con un mensaje claro', async () => {
    const { service } = setup({ key: false })
    expect(service.status().hasKey).toBe(false)
    await expect(
      service.chat({ conversationId: null, text: 'hola', context: ScreenContextSchema.parse({}) })
    ).rejects.toMatchObject({ code: 'NOT_CONFIGURED' } satisfies Partial<AppError>)
  })

  it('con clave: el estado muestra solo los últimos 4 caracteres', () => {
    const { service } = setup()
    const status = service.status()
    expect(status.hasKey).toBe(true)
    expect(status.keyHint).toBe('1234')
    expect(status.modelPriced).toBe(true)
  })

  it('el chat crea conversación, emite streaming, guarda mensajes y uso con coste', async () => {
    const { service, repo, events, client } = setup()
    const reply = await service.chat({
      conversationId: null,
      text: 'Dame un gancho',
      context: ScreenContextSchema.parse({})
    })

    expect(reply.role).toBe('assistant')
    expect(reply.blocks[0]).toMatchObject({ type: 'text', text: 'Hola desde el modelo' })
    expect(repo.conversations).toHaveLength(1)
    expect(repo.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(events[0]?.type).toBe('start')
    expect(events.filter((e) => e.type === 'delta')).toHaveLength(4)
    expect(events.at(-1)?.type).toBe('done')
    // 1000 entrada × 4$/M + 500 salida × 20$/M
    expect(reply.costUsd).toBeCloseTo(0.004 + 0.01, 6)
    expect(repo.usage[0]).toMatchObject({ kind: 'chat', model: 'claude-opus-5-5' })
    const call = (client.beta.messages.stream as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown>
    expect(call['model']).toBe('claude-opus-5-5')
    expect(call['fallbacks']).toBe('default')
    expect(call['betas']).toEqual(['server-side-fallback-2026-07-01'])
  })

  it('el historial se reenvía empezando por un mensaje de usuario', async () => {
    const { service, client } = setup()
    const first = await service.chat({
      conversationId: null,
      text: 'uno',
      context: ScreenContextSchema.parse({})
    })
    await service.chat({
      conversationId: first.conversationId,
      text: 'dos',
      context: ScreenContextSchema.parse({})
    })
    const second = (client.beta.messages.stream as unknown as ReturnType<typeof vi.fn>).mock
      .calls[1]?.[0] as { messages: Array<{ role: string }> }
    expect(second.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
  })

  it('bloquea las llamadas al superar el límite mensual', async () => {
    const { service, repo } = setup({ limit: 0.01 })
    repo.addUsage({
      model: 'x',
      kind: 'chat',
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0.02
    })
    expect(service.status().budget).toBe('exceeded')
    await expect(
      service.chat({ conversationId: null, text: 'hola', context: ScreenContextSchema.parse({}) })
    ).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' })
  })

  it('un rechazo por seguridad se guarda como aviso, no como texto', async () => {
    const { service } = setup({ client: fakeClient({ refusal: true }) })
    const reply = await service.chat({
      conversationId: null,
      text: 'x',
      context: ScreenContextSchema.parse({})
    })
    expect(reply.blocks[0]?.type).toBe('error')
  })

  it('las acciones devuelven un bloque estructurado validado', async () => {
    const parsed = { hashtags: ['#reel', '#creadores'], rationale: 'nicho + amplio' }
    const { service, repo } = setup({ client: fakeClient({ parsed }) })
    const reply = await service.runAction({
      conversationId: null,
      kind: 'hashtags',
      instruction: '',
      networks: [],
      context: ScreenContextSchema.parse({})
    })
    const block = reply.blocks[0]
    expect(block?.type).toBe('action')
    if (block?.type === 'action') {
      expect(ActionResultSchemas.hashtags.safeParse(block.result).success).toBe(true)
    }
    expect(repo.usage[0]?.kind).toBe('hashtags')
  })

  it('si la salida estructurada no se pudo interpretar, lo dice', async () => {
    const { service } = setup({ client: fakeClient({ parsed: null }) })
    const reply = await service.runAction({
      conversationId: null,
      kind: 'ideas',
      instruction: '',
      networks: [],
      context: ScreenContextSchema.parse({})
    })
    expect(reply.blocks[0]?.type).toBe('error')
  })
})
