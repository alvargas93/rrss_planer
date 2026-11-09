import * as React from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import type { Settings } from '@shared/domain/settings'
import type { UpdateStateDto } from '@shared/domain/system'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { Row } from './SettingsRow'
import { useUpdateSettings } from './useSettings'
import { useCheckUpdates, useDownloadUpdate, useInstallUpdate, useUpdateState } from './useSystem'

function describe(state: UpdateStateDto | undefined): string {
  if (!state) return 'Cargando…'
  switch (state.status) {
    case 'dev':
      return 'Solo funciona en la app instalada, no en desarrollo.'
    case 'not-configured':
      return 'Indica abajo la dirección donde publicas las versiones.'
    case 'checking':
      return 'Buscando…'
    case 'none':
      return 'Tienes la última versión.'
    case 'available':
      return `Hay una versión nueva: ${state.version}.`
    case 'downloading':
      return `Descargando… ${state.percent ?? 0} %`
    case 'ready':
      return `La versión ${state.version} está lista para instalar.`
    case 'error':
      return state.message ?? 'No se pudo comprobar.'
    default:
      return 'Sin comprobar todavía.'
  }
}

export function UpdatesCard({ settings }: { settings: Settings }): React.JSX.Element {
  const update = useUpdateSettings()
  const state = useUpdateState()
  const check = useCheckUpdates()
  const download = useDownloadUpdate()
  const install = useInstallUpdate()
  const [feed, setFeed] = React.useState<string | null>(null)
  const feedValue = feed ?? settings.general.updateFeedUrl
  const busy = state?.status === 'checking' || state?.status === 'downloading'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actualizaciones</CardTitle>
        <CardDescription>
          La app busca versiones nuevas en la dirección que indiques (por ejemplo, la de GitHub
          Releases). Nunca descarga ni instala nada sin que lo pidas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Row label={`Versión instalada ${state?.currentVersion ?? ''}`} hint={describe(state)}>
          {state?.status === 'available' ? (
            <Button size="sm" onClick={() => download.mutate(undefined)}>
              <Download aria-hidden /> Descargar
            </Button>
          ) : state?.status === 'ready' ? (
            <Button size="sm" onClick={() => install.mutate(undefined)}>
              <RefreshCw aria-hidden /> Reiniciar e instalar
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => check.mutate(undefined)}
              disabled={busy || check.isPending}
            >
              {busy || check.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw aria-hidden />
              )}
              Buscar actualizaciones
            </Button>
          )}
        </Row>
        <Row
          label="Dirección de las versiones"
          hint="Carpeta web donde están los archivos latest.yml y el instalador."
        >
          <Input
            aria-label="Dirección de las versiones"
            className="w-72"
            placeholder="https://github.com/usuario/repo/releases/latest/download/"
            value={feedValue}
            onChange={(e) => setFeed(e.target.value)}
            onBlur={() => {
              if (feed !== null && feed.trim() !== settings.general.updateFeedUrl) {
                update.mutate({ general: { updateFeedUrl: feed.trim() } })
              }
            }}
            spellCheck={false}
          />
        </Row>
        <Row
          label="Buscar cada día"
          hint="Solo avisa; la descarga y la instalación las decides tú."
        >
          <Switch
            aria-label="Buscar actualizaciones cada día"
            checked={settings.general.autoCheckUpdates}
            onCheckedChange={(autoCheckUpdates) => update.mutate({ general: { autoCheckUpdates } })}
          />
        </Row>
      </CardContent>
    </Card>
  )
}
