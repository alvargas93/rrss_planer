import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { Settings, SettingsPatch } from '@shared/domain/settings'
import type { AppInfo } from '@shared/domain/app-info'
import { invoke } from '@renderer/lib/ipc'

export const settingsKey = ['settings'] as const
export const appInfoKey = ['app', 'info'] as const

export function useSettings(): UseQueryResult<Settings, Error> {
  return useQuery({ queryKey: settingsKey, queryFn: () => invoke('settings:get') })
}

export function useAppInfo(): UseQueryResult<AppInfo, Error> {
  return useQuery({
    queryKey: appInfoKey,
    queryFn: () => invoke('app:getInfo'),
    staleTime: Infinity
  })
}

interface OptimisticContext {
  previous: Settings | undefined
}

/** Actualiza ajustes con respuesta optimista: la interfaz cambia al instante. */
export function useUpdateSettings(): UseMutationResult<
  Settings,
  Error,
  SettingsPatch,
  OptimisticContext
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: SettingsPatch) => invoke('settings:update', patch),
    onMutate: async (patch): Promise<OptimisticContext> => {
      await queryClient.cancelQueries({ queryKey: settingsKey })
      const previous = queryClient.getQueryData<Settings>(settingsKey)
      if (previous) {
        queryClient.setQueryData<Settings>(settingsKey, {
          appearance: { ...previous.appearance, ...(patch.appearance ?? {}) },
          general: { ...previous.general, ...(patch.general ?? {}) },
          ai: { ...previous.ai, ...(patch.ai ?? {}) },
          publishing: { ...previous.publishing, ...(patch.publishing ?? {}) }
        })
      }
      return { previous }
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(settingsKey, context.previous)
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsKey, settings)
    }
  })
}

export function useResetSettings(): UseMutationResult<Settings, Error, void, unknown> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => invoke('settings:reset'),
    onSuccess: (settings) => queryClient.setQueryData(settingsKey, settings)
  })
}
