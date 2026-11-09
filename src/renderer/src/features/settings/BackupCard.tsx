import * as React from 'react'
import { DatabaseBackup, FolderOpen, Loader2, RotateCcw } from 'lucide-react'
import type { Settings } from '@shared/domain/settings'
import { invoke } from '@renderer/lib/ipc'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Row } from './SettingsRow'
import { useUpdateSettings } from './useSettings'
import { useBackupStatus, useRestoreBackup, useRunBackup, useSnapshots } from './useSystem'

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' })

const formatBytes = (bytes: number): string =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`

function RestoreBody({
  initialDir,
  onClose
}: {
  initialDir: string
  onClose: () => void
}): React.JSX.Element {
  const [dir, setDir] = React.useState(initialDir)
  const [selected, setSelected] = React.useState<string | null>(null)
  const snapshots = useSnapshots(dir || null)
  const restore = useRestoreBackup()

  const chooseOther = async (): Promise<void> => {
    const chosen = await invoke('backup:chooseDir')
    if (chosen) {
      setDir(chosen)
      setSelected(null)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Restaurar una copia</DialogTitle>
        <DialogDescription>
          La app se reiniciará con los datos de la copia elegida. Lo que tienes ahora no se pierde:
          queda guardado en la carpeta de datos, en «antes-de-restaurar». Tus claves y cuentas
          conectadas en este equipo se conservan.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-xs text-muted" title={dir}>
            {dir || 'Elige la carpeta donde guardaste las copias'}
          </p>
          <Button size="sm" variant="outline" onClick={() => void chooseOther()}>
            <FolderOpen aria-hidden /> Elegir carpeta
          </Button>
        </div>

        {snapshots.isPending && dir ? (
          <p className="text-sm text-muted">Buscando copias…</p>
        ) : snapshots.data && snapshots.data.length === 0 ? (
          <p className="text-sm text-muted">No hay copias de RRSS Planner en esa carpeta.</p>
        ) : (
          <fieldset className="flex max-h-72 flex-col gap-2 overflow-auto">
            <legend className="sr-only">Copias disponibles</legend>
            {snapshots.data?.map((s) => (
              <label
                key={s.name}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
              >
                <input
                  type="radio"
                  name="snapshot"
                  className="mt-1 size-4"
                  checked={selected === s.name}
                  disabled={!s.compatible}
                  onChange={() => setSelected(s.name)}
                />
                <span className="min-w-0 text-sm">
                  <span className="font-medium">{formatDate(s.createdAt)}</span>
                  <span className="block text-xs text-muted">
                    {s.auto ? 'Automática' : 'Manual'} · versión {s.appVersion}
                  </span>
                  {s.reason && <span className="block text-xs text-danger">{s.reason}</span>}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {restore.error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {restore.error.message}
          </p>
        )}
        {restore.isSuccess && <p className="text-sm text-muted">Reiniciando la app…</p>}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={restore.isPending || restore.isSuccess}>
          Cancelar
        </Button>
        <Button
          variant="danger"
          disabled={!selected || restore.isPending || restore.isSuccess}
          onClick={() => selected && restore.mutate({ dir, snapshot: selected })}
        >
          {restore.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Restaurar y reiniciar
        </Button>
      </DialogFooter>
    </>
  )
}

export function BackupCard({ settings }: { settings: Settings }): React.JSX.Element {
  const update = useUpdateSettings()
  const status = useBackupStatus()
  const run = useRunBackup()
  const [restoreOpen, setRestoreOpen] = React.useState(false)
  const { backupDir, backupEveryDays, lastBackupAt } = settings.general

  const chooseDir = async (): Promise<void> => {
    const chosen = await invoke('backup:chooseDir')
    if (chosen) update.mutate({ general: { backupDir: chosen } })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup size={16} aria-hidden /> Copias de seguridad
        </CardTitle>
        <CardDescription>
          Guarda tus datos y medios en una carpeta normal: un disco externo o una carpeta
          sincronizada con la nube. Las claves y tokens no se copian, porque solo funcionan en este
          equipo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Row label="Carpeta de copias" hint={backupDir || 'Sin elegir'}>
          <Button variant="outline" size="sm" onClick={() => void chooseDir()}>
            <FolderOpen aria-hidden /> {backupDir ? 'Cambiar' : 'Elegir carpeta'}
          </Button>
        </Row>
        <Row
          label="Copia automática"
          hint="Se hace con la app abierta o en la bandeja. Se conservan las 8 últimas automáticas."
        >
          <Select
            value={String(backupEveryDays)}
            onValueChange={(value) =>
              update.mutate({ general: { backupEveryDays: Number(value) } })
            }
          >
            <SelectTrigger className="w-44" aria-label="Copia automática">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Desactivada</SelectItem>
              <SelectItem value="1">Cada día</SelectItem>
              <SelectItem value="7">Cada semana</SelectItem>
              <SelectItem value="30">Cada mes</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row
          label="Última copia"
          hint={
            status.data?.lastError
              ? `Falló: ${status.data.lastError}`
              : lastBackupAt
                ? formatDate(lastBackupAt)
                : 'Todavía no se ha hecho ninguna'
          }
        >
          <Button
            size="sm"
            onClick={() => run.mutate(undefined)}
            disabled={!backupDir || run.isPending}
          >
            {run.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Copiar ahora
          </Button>
        </Row>
        {run.isSuccess && (
          <p role="status" className="pb-2 text-xs text-muted">
            Copia «{run.data.snapshot}» guardada.{' '}
            {run.data.mediaCopied > 0
              ? `${run.data.mediaCopied} medios nuevos (${formatBytes(run.data.mediaBytes)}).`
              : 'No había medios nuevos.'}
          </p>
        )}
        {run.error && (
          <p role="alert" className="pb-2 text-xs text-danger">
            {run.error.message}
          </p>
        )}
        <Row label="Restaurar" hint="Vuelve a los datos de una copia anterior.">
          <Button variant="outline" size="sm" onClick={() => setRestoreOpen(true)}>
            <RotateCcw aria-hidden /> Restaurar una copia
          </Button>
        </Row>
      </CardContent>

      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent className="max-w-xl">
          <RestoreBody initialDir={backupDir} onClose={() => setRestoreOpen(false)} />
        </DialogContent>
      </Dialog>
    </Card>
  )
}
