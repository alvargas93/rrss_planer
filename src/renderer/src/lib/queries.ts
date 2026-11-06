import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { ChannelInput, ChannelName, ChannelOutput } from '@shared/contracts'
import { invoke } from './ipc'

/** Claves de caché por módulo; invalidar la raíz refresca todas sus consultas. */
export const keys = {
  settings: ['settings'] as const,
  appInfo: ['app', 'info'] as const,
  pillars: ['pillars'] as const,
  ideas: ['ideas'] as const,
  tasks: ['tasks'] as const,
  posts: ['posts'] as const,
  media: ['media'] as const,
  dashboard: ['dashboard'] as const
}

type InvokeArgs<K extends ChannelName> = ChannelInput<K> extends undefined ? [] : [ChannelInput<K>]

function callChannel<K extends ChannelName>(
  channel: K,
  input: ChannelInput<K>
): Promise<ChannelOutput<K>> {
  const args = (input === undefined ? [] : [input]) as InvokeArgs<K>
  return invoke(channel, ...args)
}

/** Consulta tipada a un canal IPC. */
export function useIpcQuery<K extends ChannelName>(
  queryKey: QueryKey,
  channel: K,
  input: ChannelInput<K>,
  options: { enabled?: boolean; staleTime?: number } = {}
): UseQueryResult<ChannelOutput<K>, Error> {
  return useQuery({
    queryKey,
    queryFn: () => callChannel(channel, input),
    ...options
  })
}

/** Mutación tipada a un canal IPC que invalida las claves indicadas al terminar bien. */
export function useIpcMutation<K extends ChannelName>(
  channel: K,
  invalidate: readonly QueryKey[],
  onSuccess?: (data: ChannelOutput<K>) => void
): UseMutationResult<ChannelOutput<K>, Error, ChannelInput<K>> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ChannelInput<K>) => callChannel(channel, input),
    onSuccess: async (data) => {
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      onSuccess?.(data)
    }
  })
}
