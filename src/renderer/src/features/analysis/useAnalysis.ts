import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import type { ChannelInput, ChannelName, ChannelOutput } from '@shared/contracts'
import type { Analysis, Profile, Snapshot } from '@shared/domain/analysis'
import { keys, useIpcMutation, useIpcQuery } from '@renderer/lib/queries'
import { aiKeys } from '@renderer/features/ai/useAi'

export const analysisKeys = {
  root: ['analysis'] as const,
  profiles: ['analysis', 'profiles'] as const,
  snapshots: (profileId: string) => ['analysis', 'snapshots', profileId] as const,
  list: (profileId: string) => ['analysis', 'list', profileId] as const,
  sources: ['analysis', 'sources'] as const
}

type Mutation<K extends ChannelName> = UseMutationResult<ChannelOutput<K>, Error, ChannelInput<K>>

export function useProfiles(): UseQueryResult<Profile[], Error> {
  return useIpcQuery(analysisKeys.profiles, 'analysis:profiles:list', undefined)
}

export function useCreateProfile(): Mutation<'analysis:profiles:create'> {
  return useIpcMutation('analysis:profiles:create', [analysisKeys.profiles])
}

export function useUpdateProfile(): Mutation<'analysis:profiles:update'> {
  return useIpcMutation('analysis:profiles:update', [analysisKeys.profiles])
}

export function useDeleteProfile(): Mutation<'analysis:profiles:delete'> {
  return useIpcMutation('analysis:profiles:delete', [analysisKeys.root])
}

export function useSnapshots(profileId: string | null): UseQueryResult<Snapshot[], Error> {
  return useIpcQuery(
    analysisKeys.snapshots(profileId ?? ''),
    'analysis:snapshots:list',
    { profileId: profileId ?? '' },
    { enabled: !!profileId }
  )
}

export function useSaveSnapshot(): Mutation<'analysis:snapshots:save'> {
  return useIpcMutation('analysis:snapshots:save', [analysisKeys.root])
}

export function useDeleteSnapshot(): Mutation<'analysis:snapshots:delete'> {
  return useIpcMutation('analysis:snapshots:delete', [analysisKeys.root])
}

export function usePickScreenshots(): Mutation<'analysis:pickScreenshots'> {
  return useIpcMutation('analysis:pickScreenshots', [])
}

export function useReadScreenshots(): Mutation<'analysis:readScreenshots'> {
  return useIpcMutation('analysis:readScreenshots', [aiKeys.status])
}

export function useRefreshAuto(): Mutation<'analysis:refreshAuto'> {
  return useIpcMutation('analysis:refreshAuto', [analysisKeys.root])
}

export function useSources(): UseQueryResult<ChannelOutput<'analysis:sources'>, Error> {
  return useIpcQuery(analysisKeys.sources, 'analysis:sources', undefined)
}

export function useSetYoutubeKey(): Mutation<'analysis:setYoutubeApiKey'> {
  return useIpcMutation('analysis:setYoutubeApiKey', [analysisKeys.sources])
}

export function useClearYoutubeKey(): Mutation<'analysis:clearYoutubeApiKey'> {
  return useIpcMutation('analysis:clearYoutubeApiKey', [analysisKeys.sources])
}

export function useAnalyses(profileId: string | null): UseQueryResult<Analysis[], Error> {
  return useIpcQuery(
    analysisKeys.list(profileId ?? ''),
    'analysis:list',
    { profileId: profileId ?? '' },
    { enabled: !!profileId }
  )
}

export function useAudit(): Mutation<'analysis:audit'> {
  return useIpcMutation('analysis:audit', [analysisKeys.root, aiKeys.status])
}

export function usePlan(): Mutation<'analysis:plan'> {
  return useIpcMutation('analysis:plan', [analysisKeys.root, aiKeys.status])
}

export function useApplyPlan(): Mutation<'analysis:applyPlan'> {
  return useIpcMutation('analysis:applyPlan', [analysisKeys.root, keys.posts, keys.dashboard])
}

export function useDeleteAnalysis(): Mutation<'analysis:delete'> {
  return useIpcMutation('analysis:delete', [analysisKeys.root])
}
