import * as React from 'react'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import type { MediaAsset } from '@shared/domain/media'
import type { Cue, ExportProgress, VideoProject } from '@shared/domain/video'
import type { ChannelInput } from '@shared/contracts'
import { keys, useIpcMutation, useIpcQuery } from '@renderer/lib/queries'
import { onEvent } from '@renderer/lib/events'

export const videoKeys = { projects: ['video', 'projects'] as const }

export function useVideoProjects(): UseQueryResult<VideoProject[], Error> {
  return useIpcQuery(videoKeys.projects, 'video:projects:list', undefined)
}

export function useCreateProject(): UseMutationResult<
  VideoProject,
  Error,
  ChannelInput<'video:projects:create'>
> {
  return useIpcMutation('video:projects:create', [videoKeys.projects])
}

export function useUpdateProject(): UseMutationResult<
  VideoProject,
  Error,
  ChannelInput<'video:projects:update'>
> {
  return useIpcMutation('video:projects:update', [videoKeys.projects])
}

export function useDeleteProject(): UseMutationResult<void, Error, { id: string }> {
  return useIpcMutation('video:projects:delete', [videoKeys.projects])
}

export function useExportProject(): UseMutationResult<MediaAsset, Error, { id: string }> {
  return useIpcMutation('video:export', [videoKeys.projects, keys.media])
}

export function useReprocessMedia(): UseMutationResult<MediaAsset, Error, { id: string }> {
  return useIpcMutation('media:reprocess', [keys.media])
}

/** Último progreso de exportación recibido para un proyecto. */
export function useExportProgress(projectId: string | null): ExportProgress | null {
  const [progress, setProgress] = React.useState<ExportProgress | null>(null)
  React.useEffect(() => {
    return onEvent('video:progress', (p) => {
      if (p.projectId === projectId) setProgress(p)
    })
  }, [projectId])
  return progress
}

/** Transcribe el audio de los clips del proyecto con Whisper en local. */
export function useTranscribeVideo(): UseMutationResult<Cue[], Error, { id: string }> {
  return useIpcMutation('video:transcribe', [])
}
