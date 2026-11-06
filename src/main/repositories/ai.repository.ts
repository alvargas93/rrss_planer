import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { aiConversations, aiMessages, aiUsage } from '../db/schema'
import { newId, nowIso } from '../db/helpers'
import {
  AiMessageBlockSchema,
  monthKey,
  type AiConversation,
  type AiMessage,
  type AiMessageBlock,
  type TokenUsage,
  type UsageSummary
} from '@shared/domain/ai'
import { AppError } from '@shared/domain/errors'

type ConversationRow = typeof aiConversations.$inferSelect
type MessageRow = typeof aiMessages.$inferSelect

function toConversation(row: ConversationRow): AiConversation {
  return {
    id: row.id,
    title: row.title,
    contextType: row.contextType,
    contextId: row.contextId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function parseBlocks(json: string): AiMessageBlock[] {
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((b) => AiMessageBlockSchema.safeParse(b))
      .filter((r) => r.success)
      .map((r) => r.data)
  } catch {
    return []
  }
}

function toMessage(row: MessageRow): AiMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as AiMessage['role'],
    blocks: parseBlocks(row.contentJson),
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    costUsd: row.costUsd,
    createdAt: row.createdAt
  }
}

export interface MessageCreate {
  id?: string
  conversationId: string
  role: 'user' | 'assistant'
  blocks: AiMessageBlock[]
  model?: string | null
  usage?: TokenUsage
  costUsd?: number
}

export interface UsageCreate extends TokenUsage {
  model: string
  kind: string
  costUsd: number
}

export class AiRepository {
  constructor(private readonly db: Db) {}

  // ----------------------------------------------------------- conversaciones

  listConversations(): AiConversation[] {
    return this.db
      .select()
      .from(aiConversations)
      .where(isNull(aiConversations.deletedAt))
      .orderBy(desc(aiConversations.updatedAt))
      .all()
      .map(toConversation)
  }

  getConversation(id: string): AiConversation {
    const row = this.db.select().from(aiConversations).where(eq(aiConversations.id, id)).get()
    if (!row || row.deletedAt) throw new AppError('NOT_FOUND', 'La conversación no existe')
    return toConversation(row)
  }

  createConversation(input: {
    title: string
    contextType?: string
    contextId?: string | null
  }): AiConversation {
    const now = nowIso()
    const row: ConversationRow = {
      id: newId(),
      title: input.title || 'Nueva conversación',
      contextType: input.contextType ?? 'screen',
      contextId: input.contextId ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    }
    this.db.insert(aiConversations).values(row).run()
    return toConversation(row)
  }

  renameConversation(id: string, title: string): void {
    this.db
      .update(aiConversations)
      .set({ title, updatedAt: nowIso() })
      .where(eq(aiConversations.id, id))
      .run()
  }

  touchConversation(id: string): void {
    this.db
      .update(aiConversations)
      .set({ updatedAt: nowIso() })
      .where(eq(aiConversations.id, id))
      .run()
  }

  deleteConversation(id: string): void {
    this.getConversation(id)
    this.db
      .update(aiConversations)
      .set({ deletedAt: nowIso() })
      .where(eq(aiConversations.id, id))
      .run()
  }

  // ----------------------------------------------------------- mensajes

  listMessages(conversationId: string, limit = 200): AiMessage[] {
    return this.db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(asc(aiMessages.createdAt))
      .limit(limit)
      .all()
      .map(toMessage)
  }

  addMessage(input: MessageCreate): AiMessage {
    const row: MessageRow = {
      id: input.id ?? newId(),
      conversationId: input.conversationId,
      role: input.role,
      contentJson: JSON.stringify(input.blocks),
      model: input.model ?? null,
      inputTokens: input.usage?.inputTokens ?? 0,
      outputTokens: input.usage?.outputTokens ?? 0,
      costUsd: input.costUsd ?? 0,
      createdAt: nowIso()
    }
    this.db.insert(aiMessages).values(row).run()
    this.touchConversation(input.conversationId)
    return toMessage(row)
  }

  // ----------------------------------------------------------- uso

  addUsage(input: UsageCreate, at = new Date()): void {
    this.db
      .insert(aiUsage)
      .values({
        id: newId(),
        month: monthKey(at),
        model: input.model,
        kind: input.kind,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        cacheReadTokens: input.cacheReadTokens,
        cacheWriteTokens: input.cacheWriteTokens,
        costUsd: input.costUsd,
        createdAt: at.toISOString()
      })
      .run()
  }

  usageForMonth(month: string): UsageSummary {
    const row = this.db
      .select({
        calls: sql<number>`count(*)`,
        inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
        outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
        costUsd: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)`
      })
      .from(aiUsage)
      .where(and(eq(aiUsage.month, month)))
      .get()
    return {
      month,
      calls: row?.calls ?? 0,
      inputTokens: row?.inputTokens ?? 0,
      outputTokens: row?.outputTokens ?? 0,
      costUsd: row?.costUsd ?? 0
    }
  }

  usageHistory(months = 6): UsageSummary[] {
    const rows = this.db
      .select({
        month: aiUsage.month,
        calls: sql<number>`count(*)`,
        inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
        outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
        costUsd: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)`
      })
      .from(aiUsage)
      .groupBy(aiUsage.month)
      .orderBy(desc(aiUsage.month))
      .limit(months)
      .all()
    return rows
  }
}
