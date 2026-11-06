import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import type { Task } from '@shared/domain/tasks'
import type { ChannelInput } from '@shared/contracts'
import { keys, useIpcMutation, useIpcQuery } from '@renderer/lib/queries'

const related = [keys.tasks, keys.dashboard]

export function useTasks(): UseQueryResult<Task[], Error> {
  return useIpcQuery(keys.tasks, 'tasks:list', undefined)
}

export function useCreateTask(): UseMutationResult<Task, Error, ChannelInput<'tasks:create'>> {
  return useIpcMutation('tasks:create', related)
}

export function useUpdateTask(): UseMutationResult<Task, Error, ChannelInput<'tasks:update'>> {
  return useIpcMutation('tasks:update', related)
}

export function useMoveTask(): UseMutationResult<Task[], Error, ChannelInput<'tasks:move'>> {
  return useIpcMutation('tasks:move', related)
}

export function useDeleteTask(): UseMutationResult<void, Error, { id: string }> {
  return useIpcMutation('tasks:delete', related)
}
