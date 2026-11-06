import * as React from 'react'
import { FolderOpen, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import type { Settings } from '@shared/domain/settings'
import { invoke } from '@renderer/lib/ipc'
import { PageHeader } from '@renderer/components/PageHeader'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Segmented } from '@renderer/components/ui/segmented'
import { Switch } from '@renderer/components/ui/switch'
import { Button } from '@renderer/components/ui/button'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useAppInfo, useResetSettings, useSettings, useUpdateSettings } from './useSettings'
import { AccentSamples } from './AccentSamples'

function Row({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 py-3 not-last:border-b not-last:border-border">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function SettingsSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-40" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
  )
}

export function SettingsPage(): React.JSX.Element {
  const settingsQuery = useSettings()
  const appInfo = useAppInfo()
  const update = useUpdateSettings()
  const reset = useResetSettings()
  const [confirmReset, setConfirmReset] = React.useState(false)

  if (settingsQuery.isPending) {
    return (
      <>
        <PageHeader title="Ajustes" />
        <SettingsSkeleton />
      </>
    )
  }

  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <>
        <PageHeader title="Ajustes" />
        <Card>
          <CardContent className="p-5 text-sm text-danger">
            No se pudieron cargar los ajustes: {settingsQuery.error?.message ?? 'error desconocido'}
            .
          </CardContent>
        </Card>
      </>
    )
  }

  const settings: Settings = settingsQuery.data

  return (
    <>
      <PageHeader
        title="Ajustes"
        description="Apariencia, idioma y dónde se guardan tus datos. Los ajustes de Claude y de las redes llegan en sus fases."
      />

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Apariencia</CardTitle>
            <CardDescription>
              El tema se aplica al instante y se recuerda al reabrir la app.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Row label="Tema" hint="Claro, oscuro o el que tenga el sistema en cada momento.">
              <Segmented
                aria-label="Tema"
                value={settings.appearance.theme}
                onChange={(theme) => update.mutate({ appearance: { theme } })}
                options={[
                  { value: 'light', label: 'Claro', icon: Sun },
                  { value: 'dark', label: 'Oscuro', icon: Moon },
                  { value: 'system', label: 'Sistema', icon: Monitor }
                ]}
              />
            </Row>
            <Row label="Reducir movimiento" hint="Desactiva animaciones y transiciones.">
              <Segmented
                aria-label="Reducir movimiento"
                value={settings.appearance.reduceMotion}
                onChange={(reduceMotion) => update.mutate({ appearance: { reduceMotion } })}
                options={[
                  { value: 'system', label: 'Sistema' },
                  { value: 'on', label: 'Sí' },
                  { value: 'off', label: 'No' }
                ]}
              />
            </Row>
            <div className="pt-4">
              <p className="mb-3 text-sm font-medium">Acento de color</p>
              <AccentSamples />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent>
            <Row
              label="Idioma"
              hint="La interfaz en inglés llegará más adelante; el ajuste ya se guarda."
            >
              <Select
                value={settings.general.language}
                onValueChange={(language) =>
                  update.mutate({ general: { language: language as 'es' | 'en' } })
                }
              >
                <SelectTrigger className="w-44" aria-label="Idioma">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row
              label="Seguir en la bandeja al cerrar"
              hint="Necesario para que las publicaciones programadas salgan a su hora (se activa en la Fase 4)."
            >
              <Switch
                aria-label="Seguir en la bandeja al cerrar"
                checked={settings.general.keepRunningInTray}
                onCheckedChange={(keepRunningInTray) =>
                  update.mutate({ general: { keepRunningInTray } })
                }
              />
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Datos</CardTitle>
            <CardDescription>
              Todo se guarda en tu equipo. No hay servidor ni cuenta de usuario.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Row label="Carpeta de datos" hint={appInfo.data?.dataDir ?? 'Cargando…'}>
              <Button variant="outline" size="sm" onClick={() => void invoke('app:openDataFolder')}>
                <FolderOpen aria-hidden />
                Abrir carpeta
              </Button>
            </Row>
            <Row label="Base de datos" hint={appInfo.data?.dbPath ?? 'Cargando…'}>
              <span className="text-xs text-subtle">SQLite</span>
            </Row>
            <Row
              label="Restablecer ajustes"
              hint="Vuelve a los valores por defecto. No borra tus datos."
            >
              {confirmReset ? (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                    Cancelar
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      reset.mutate()
                      setConfirmReset(false)
                    }}
                  >
                    Sí, restablecer
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)}>
                  <RotateCcw aria-hidden />
                  Restablecer
                </Button>
              )}
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acerca de</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted">Versión</dt>
              <dd>
                {appInfo.data?.version ?? '…'}
                {appInfo.data?.isDev && (
                  <span className="ml-2 text-xs text-subtle">(desarrollo)</span>
                )}
              </dd>
              <dt className="text-muted">Electron</dt>
              <dd>{appInfo.data?.electron ?? '…'}</dd>
              <dt className="text-muted">Node</dt>
              <dd>{appInfo.data?.node ?? '…'}</dd>
            </dl>
          </CardContent>
        </Card>

        {update.isError && (
          <p role="alert" className="text-sm text-danger">
            No se pudo guardar el ajuste: {update.error.message}
          </p>
        )}
      </div>
    </>
  )
}
