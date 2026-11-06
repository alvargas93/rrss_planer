import * as React from 'react'
import { useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import type { PostTarget, ValidationIssue } from '@shared/domain/publishing'
import type { ChannelInput, ChannelOutput } from '@shared/contracts'
import { keys, useIpcMutation, useIpcQuery } from '@renderer/lib/queries'
import { onEvent } from '@renderer/lib/events'

const related = [keys.posts, keys.dashboard]

export const publishingKeys = {
  validation: (postId: string) => ['publishing', 'validate', postId] as const,
  host: ['publishing', 'host'] as const
}

export function useValidation(
  postId: string | undefined
): UseQueryResult<Record<string, ValidationIssue[]>, Error> {
  return useIpcQuery(
    publishingKeys.validation(postId ?? ''),
    'publishing:validate',
    { id: postId ?? '' },
    { enabled: !!postId, staleTime: 0 }
  )
}

export function useSetTarget(): UseMutationResult<
  PostTarget[],
  Error,
  ChannelInput<'publishing:setTarget'>
> {
  return useIpcMutation('publishing:setTarget', related)
}

export function usePublishNow(): UseMutationResult<
  PostTarget[],
  Error,
  ChannelInput<'publishing:publishNow'>
> {
  return useIpcMutation('publishing:publishNow', related)
}

export function useRetryTarget(): UseMutationResult<PostTarget, Error, { targetId: string }> {
  return useIpcMutation('publishing:retry', related)
}

export function useCancelTarget(): UseMutationResult<PostTarget, Error, { targetId: string }> {
  return useIpcMutation('publishing:cancel', related)
}

export function useHostStatus(): UseQueryResult<ChannelOutput<'publishing:hostStatus'>, Error> {
  return useIpcQuery(publishingKeys.host, 'publishing:hostStatus', undefined)
}

export function useSetCloudinarySecret(): UseMutationResult<void, Error, { apiSecret: string }> {
  return useIpcMutation('publishing:setCloudinarySecret', [publishingKeys.host])
}

/** Refresca las consultas de posts cuando la cola de publicación cambia algo. */
export function usePublishingEvents(): void {
  const queryClient = useQueryClient()
  React.useEffect(() => {
    return onEvent('publishing:update', ({ postId }) => {
      void queryClient.invalidateQueries({ queryKey: keys.posts })
      void queryClient.invalidateQueries({ queryKey: keys.dashboard })
      void queryClient.invalidateQueries({ queryKey: publishingKeys.validation(postId) })
    })
  }, [queryClient])
}
