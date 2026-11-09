import * as React from 'react'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import type { z } from 'zod'
import type {
  BackupRunResultSchema,
  BackupStatusSchema,
  SnapshotInfoDto,
  UpdateStateDto
} from '@shared/domain/system'
import { useIpcMutation, useIpcQuery } from '@renderer/lib/queries'
import { onEvent } from '@renderer/lib/events'

export const backupKey = ['backup'] as const
const updatesKey = ['updates'] as const

type BackupStatus = z.infer<typeof BackupStatusSchema>
type BackupRunResult = z.infer<typeof BackupRunResultSchema>

export function useBackupStatus(): UseQueryResult<BackupStatus, Error> {
  return useIpcQuery(backupKey, 'backup:status', undefined, { staleTime: 0 })
}

export function useRunBackup(): UseMutationResult<BackupRunResult, Error, undefined> {
  return useIpcMutation('backup:run', [backupKey])
}

/** Copias que hay en una carpeta; no consulta hasta que haya carpeta. */
export function useSnapshots(dir: string | null): UseQueryResult<SnapshotInfoDto[], Error> {
  return useIpcQuery(
    [...backupKey, 'list', dir ?? ''],
    'backup:list',
    { dir: dir ?? '' },
    { enabled: Boolean(dir), staleTime: 0 }
  )
}

export function useRestoreBackup(): UseMutationResult<
  void,
  Error,
  { dir: string; snapshot: string }
> {
  return useIpcMutation('backup:restore', [])
}

/** Estado de las actualizaciones: el inicial y los que empuja el proceso principal. */
export function useUpdateState(): UpdateStateDto | undefined {
  const query = useIpcQuery(updatesKey, 'updates:state', undefined, { staleTime: Infinity })
  const [live, setLive] = React.useState<UpdateStateDto | null>(null)
  React.useEffect(() => onEvent('updates:state', setLive), [])
  return live ?? query.data
}

export function useCheckUpdates(): UseMutationResult<UpdateStateDto, Error, undefined> {
  return useIpcMutation('updates:check', [updatesKey])
}

export function useDownloadUpdate(): UseMutationResult<UpdateStateDto, Error, undefined> {
  return useIpcMutation('updates:download', [updatesKey])
}

export function useInstallUpdate(): UseMutationResult<void, Error, undefined> {
  return useIpcMutation('updates:install', [])
}
