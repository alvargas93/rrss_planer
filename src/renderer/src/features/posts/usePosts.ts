import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import type { PostDetail, PostSummary } from '@shared/domain/posts'
import type { ChannelInput } from '@shared/contracts'
import { keys, useIpcMutation, useIpcQuery } from '@renderer/lib/queries'

const related = [keys.posts, keys.dashboard, keys.tasks]

export function usePosts(filter: ChannelInput<'posts:list'>): UseQueryResult<PostSummary[], Error> {
  return useIpcQuery([...keys.posts, 'list', filter], 'posts:list', filter)
}

export function usePost(id: string | undefined): UseQueryResult<PostDetail, Error> {
  return useIpcQuery(
    [...keys.posts, 'detail', id],
    'posts:get',
    { id: id ?? '' },
    { enabled: !!id }
  )
}

export function useCreatePost(): UseMutationResult<
  PostDetail,
  Error,
  ChannelInput<'posts:create'>
> {
  return useIpcMutation('posts:create', related)
}

export function useUpdatePost(): UseMutationResult<
  PostDetail,
  Error,
  ChannelInput<'posts:update'>
> {
  return useIpcMutation('posts:update', related)
}

export function useSchedulePost(): UseMutationResult<
  PostSummary,
  Error,
  ChannelInput<'posts:schedule'>
> {
  return useIpcMutation('posts:schedule', related)
}

export function useDeletePost(): UseMutationResult<void, Error, { id: string }> {
  return useIpcMutation('posts:delete', related)
}
