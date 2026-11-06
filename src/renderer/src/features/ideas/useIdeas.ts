import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import type { Idea, IdeaFilter } from '@shared/domain/ideas'
import type { ChannelInput } from '@shared/contracts'
import { keys, useIpcMutation, useIpcQuery } from '@renderer/lib/queries'

const related = [keys.ideas, keys.dashboard]

export function useIdeas(
  filter: ChannelInput<'ideas:list'>,
  options: { enabled?: boolean } = {}
): UseQueryResult<Idea[], Error> {
  return useIpcQuery([...keys.ideas, filter], 'ideas:list', filter, options)
}

export type { IdeaFilter }

export function useCreateIdea(): UseMutationResult<Idea, Error, ChannelInput<'ideas:create'>> {
  return useIpcMutation('ideas:create', related)
}

export function useUpdateIdea(): UseMutationResult<Idea, Error, ChannelInput<'ideas:update'>> {
  return useIpcMutation('ideas:update', related)
}

export function useDeleteIdea(): UseMutationResult<void, Error, { id: string }> {
  return useIpcMutation('ideas:delete', related)
}
