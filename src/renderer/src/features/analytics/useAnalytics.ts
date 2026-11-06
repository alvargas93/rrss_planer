import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import type { AnalyticsOverview, AnalyticsQuery, SyncResult } from '@shared/domain/analytics'
import { useIpcMutation, useIpcQuery } from '@renderer/lib/queries'
import { accountKeys } from '@renderer/features/accounts/useAccounts'

export const analyticsKeys = {
  all: ['analytics'] as const,
  overview: (q: AnalyticsQuery) => ['analytics', 'overview', q.accountId, q.days] as const,
  digest: (q: AnalyticsQuery) => ['analytics', 'digest', q.accountId, q.days] as const
}

export function useAnalyticsOverview(
  query: AnalyticsQuery | null
): UseQueryResult<AnalyticsOverview, Error> {
  return useIpcQuery(
    query ? analyticsKeys.overview(query) : ['analytics', 'overview', 'none'],
    'analytics:overview',
    query ?? { accountId: '', days: 30 },
    { enabled: !!query }
  )
}

export function useAnalyticsDigest(
  query: AnalyticsQuery | null
): UseQueryResult<{ text: string }, Error> {
  return useIpcQuery(
    query ? analyticsKeys.digest(query) : ['analytics', 'digest', 'none'],
    'analytics:digest',
    query ?? { accountId: '', days: 30 },
    { enabled: !!query }
  )
}

export function useSyncAnalytics(): UseMutationResult<SyncResult[], Error, { accountId?: string }> {
  return useIpcMutation('analytics:sync', [analyticsKeys.all, accountKeys.all])
}
