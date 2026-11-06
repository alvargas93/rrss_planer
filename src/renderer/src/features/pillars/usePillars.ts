import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import type { Pillar } from '@shared/domain/pillars'
import type { ChannelInput } from '@shared/contracts'
import { keys, useIpcMutation, useIpcQuery } from '@renderer/lib/queries'

const related = [keys.pillars, keys.ideas, keys.posts, keys.dashboard]

export function usePillars(): UseQueryResult<Pillar[], Error> {
  return useIpcQuery(keys.pillars, 'pillars:list', undefined, { staleTime: 60_000 })
}

export function useCreatePillar(): UseMutationResult<
  Pillar,
  Error,
  ChannelInput<'pillars:create'>
> {
  return useIpcMutation('pillars:create', related)
}

export function useUpdatePillar(): UseMutationResult<
  Pillar,
  Error,
  ChannelInput<'pillars:update'>
> {
  return useIpcMutation('pillars:update', related)
}

export function useDeletePillar(): UseMutationResult<void, Error, { id: string }> {
  return useIpcMutation('pillars:delete', related)
}
