import * as React from 'react'
import { useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import type {
  AiConversation,
  AiMessage,
  AiStatus,
  ModelInfo,
  UsageSummary
} from '@shared/domain/ai'
import type { ChannelInput } from '@shared/contracts'
import { keys, useIpcMutation, useIpcQuery } from '@renderer/lib/queries'
import { onEvent } from '@renderer/lib/events'

export const aiKeys = {
  status: ['ai', 'status'] as const,
  usage: ['ai', 'usage'] as const,
  conversations: ['ai', 'conversations'] as const,
  messages: (id: string | null) => ['ai', 'messages', id] as const
}

const statusRelated = [aiKeys.status, aiKeys.usage, keys.settings]

export function useAiStatus(): UseQueryResult<AiStatus, Error> {
  return useIpcQuery(aiKeys.status, 'ai:status', undefined, { staleTime: 10_000 })
}

export function useSetApiKey(): UseMutationResult<AiStatus, Error, ChannelInput<'ai:setApiKey'>> {
  return useIpcMutation('ai:setApiKey', statusRelated)
}

export function useClearApiKey(): UseMutationResult<AiStatus, Error, undefined> {
  return useIpcMutation('ai:clearApiKey', statusRelated)
}

export function useTestConnection(): UseMutationResult<ModelInfo[], Error, undefined> {
  return useIpcMutation('ai:testConnection', [aiKeys.status])
}

export function useUsageHistory(): UseQueryResult<UsageSummary[], Error> {
  return useIpcQuery(aiKeys.usage, 'ai:usageHistory', undefined)
}

export function useConversations(): UseQueryResult<AiConversation[], Error> {
  return useIpcQuery(aiKeys.conversations, 'ai:conversations:list', undefined)
}

export function useDeleteConversation(): UseMutationResult<void, Error, { id: string }> {
  return useIpcMutation('ai:conversations:delete', [aiKeys.conversations])
}

export function useMessages(conversationId: string | null): UseQueryResult<AiMessage[], Error> {
  return useIpcQuery(
    aiKeys.messages(conversationId),
    'ai:messages:list',
    { conversationId: conversationId ?? '' },
    { enabled: !!conversationId }
  )
}

const afterReply = [aiKeys.conversations, aiKeys.status, aiKeys.usage]

export function useChat(): UseMutationResult<AiMessage, Error, ChannelInput<'ai:chat'>> {
  const queryClient = useQueryClient()
  return useIpcMutation('ai:chat', afterReply, (message) => {
    void queryClient.invalidateQueries({ queryKey: aiKeys.messages(message.conversationId) })
  })
}

export function useRunAction(): UseMutationResult<AiMessage, Error, ChannelInput<'ai:runAction'>> {
  const queryClient = useQueryClient()
  return useIpcMutation('ai:runAction', afterReply, (message) => {
    void queryClient.invalidateQueries({ queryKey: aiKeys.messages(message.conversationId) })
  })
}

export interface StreamingReply {
  conversationId: string
  messageId: string
  text: string
  done: boolean
  error: string | null
}

/**
 * Texto de la respuesta que está llegando por streaming, si hay alguna.
 * Se limpia cuando el mensaje definitivo ya está en la caché.
 */
export function useStreamingReply(): StreamingReply | null {
  const [reply, setReply] = React.useState<StreamingReply | null>(null)

  React.useEffect(() => {
    return onEvent('ai:stream', (event) => {
      switch (event.type) {
        case 'start':
          setReply({ ...event, text: '', done: false, error: null })
          break
        case 'delta':
          setReply((current) =>
            current && current.messageId === event.messageId
              ? { ...current, text: current.text + event.text }
              : { ...event, text: event.text, done: false, error: null }
          )
          break
        case 'done':
          setReply((current) =>
            current && current.messageId === event.messageId ? { ...current, done: true } : current
          )
          break
        case 'error':
          setReply((current) =>
            current && current.messageId === event.messageId
              ? { ...current, done: true, error: event.message }
              : current
          )
          break
      }
    })
  }, [])

  const clear = React.useCallback(() => setReply(null), [])
  // Exponemos clear a través de una propiedad no enumerable para no cambiar la forma pública.
  return React.useMemo(() => (reply ? Object.assign({}, reply, { clear }) : null), [reply, clear])
}
