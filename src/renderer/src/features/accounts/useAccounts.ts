import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import type { Account } from '@shared/domain/accounts'
import type { Capabilities } from '@shared/connectors/Connector'
import type { Network } from '@shared/connectors/networks'
import type { ChannelInput } from '@shared/contracts'
import { keys, useIpcMutation, useIpcQuery } from '@renderer/lib/queries'

export const accountKeys = {
  all: ['accounts'] as const,
  capabilities: (network: Network) => ['accounts', 'capabilities', network] as const
}

const related = [accountKeys.all, keys.posts, keys.dashboard]

export function useAccounts(): UseQueryResult<Account[], Error> {
  return useIpcQuery(accountKeys.all, 'accounts:list', undefined, { staleTime: 30_000 })
}

export function useCapabilities(network: Network): UseQueryResult<Capabilities, Error> {
  return useIpcQuery(
    accountKeys.capabilities(network),
    'accounts:capabilities',
    { network },
    { staleTime: Infinity }
  )
}

export function useConnectInstagramToken(): UseMutationResult<
  Account,
  Error,
  ChannelInput<'accounts:connectInstagramToken'>
> {
  return useIpcMutation('accounts:connectInstagramToken', related)
}

export function useConnectInstagramOAuth(): UseMutationResult<
  Account,
  Error,
  ChannelInput<'accounts:connectInstagramOAuth'>
> {
  return useIpcMutation('accounts:connectInstagramOAuth', related)
}

export function useRefreshAccount(): UseMutationResult<Account, Error, { id: string }> {
  return useIpcMutation('accounts:refresh', related)
}

export function useDisconnectAccount(): UseMutationResult<void, Error, { id: string }> {
  return useIpcMutation('accounts:disconnect', related)
}
