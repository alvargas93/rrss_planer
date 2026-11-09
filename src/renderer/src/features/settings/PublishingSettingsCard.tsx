import * as React from 'react'
import { Check, Cloud } from 'lucide-react'
import type { Settings } from '@shared/domain/settings'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Field, Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useHostStatus, useSetCloudinarySecret } from '@renderer/features/publishing/usePublishing'
import { useUpdateSettings } from './useSettings'

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

export function PublishingSettingsCard({ settings }: { settings: Settings }): React.JSX.Element {
  const update = useUpdateSettings()
  const host = useHostStatus()
  const setSecret = useSetCloudinarySecret()
  const [secret, setSecretValue] = React.useState('')
  const p = settings.publishing

  return (
    <Card>
      <CardHeader>
        <CardTitle>Publicación</CardTitle>
        <CardDescription>
          Instagram descarga los archivos desde una URL pública, así que la app los sube a un
          alojamiento temporal, publica y los borra. Sin alojamiento, las publicaciones con archivos
          van en modo manual.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Row
          label="Publicar por API"
          hint="Desactivado (recomendado): preparas cada pieza y la publicas tú; la app te avisa a la hora. Activado: la app publica sola en las cuentas conectadas."
        >
          <Switch
            checked={p.mode === 'api'}
            onCheckedChange={(on) => update.mutate({ publishing: { mode: on ? 'api' : 'manual' } })}
            aria-label="Publicar por API"
          />
        </Row>
        <Row
          label="Alojamiento temporal de medios"
          hint="Cloudinary tiene plan gratuito; solo hacen falta tres datos de tu cuenta."
        >
          <div className="flex items-center gap-2">
            {host.data && (
              <Badge tone={host.data.configured ? 'success' : 'warning'}>
                {host.data.configured ? <Check size={12} aria-hidden /> : null}
                {host.data.configured ? 'Listo' : 'Sin configurar'}
              </Badge>
            )}
            <Select
              value={p.mediaHost}
              onValueChange={(mediaHost) =>
                update.mutate({ publishing: { mediaHost: mediaHost as 'none' | 'cloudinary' } })
              }
            >
              <SelectTrigger className="w-44" aria-label="Alojamiento de medios">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ninguno (manual)</SelectItem>
                <SelectItem value="cloudinary">Cloudinary</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Row>
        {p.mediaHost === 'cloudinary' && (
          <div className="grid gap-3 py-3 not-last:border-b not-last:border-border sm:grid-cols-3">
            <Field label="Cloud name" htmlFor="cl-cloud">
              <Input
                id="cl-cloud"
                defaultValue={p.cloudinaryCloudName}
                onBlur={(e) =>
                  update.mutate({ publishing: { cloudinaryCloudName: e.target.value.trim() } })
                }
                className="font-mono text-xs"
              />
            </Field>
            <Field label="API key" htmlFor="cl-key">
              <Input
                id="cl-key"
                defaultValue={p.cloudinaryApiKey}
                onBlur={(e) =>
                  update.mutate({ publishing: { cloudinaryApiKey: e.target.value.trim() } })
                }
                className="font-mono text-xs"
              />
            </Field>
            <Field
              label="API secret"
              htmlFor="cl-secret"
              hint={host.data?.hasSecret ? 'Guardado cifrado.' : 'Se guarda cifrado.'}
            >
              <div className="flex gap-1">
                <Input
                  id="cl-secret"
                  type="password"
                  value={secret}
                  onChange={(e) => setSecretValue(e.target.value)}
                  placeholder={host.data?.hasSecret ? '••••••••' : ''}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
                <Button
                  size="sm"
                  className="h-9"
                  disabled={!secret.trim() || setSecret.isPending}
                  onClick={() =>
                    setSecret.mutate(
                      { apiSecret: secret.trim() },
                      { onSuccess: () => setSecretValue('') }
                    )
                  }
                >
                  <Cloud aria-hidden /> Guardar
                </Button>
              </div>
            </Field>
            {setSecret.error && (
              <p role="alert" className="text-sm text-danger sm:col-span-3">
                {setSecret.error.message}
              </p>
            )}
          </div>
        )}
        <Row
          label="Avisar al publicar"
          hint="Notificación del sistema cuando una publicación sale o falla."
        >
          <Switch
            aria-label="Avisar al publicar"
            checked={p.notifyOnPublish}
            onCheckedChange={(notifyOnPublish) =>
              update.mutate({ publishing: { notifyOnPublish } })
            }
          />
        </Row>
        <Row
          label="Seguir en la bandeja al cerrar"
          hint="Necesario para que las publicaciones programadas salgan con la ventana cerrada."
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
  )
}
