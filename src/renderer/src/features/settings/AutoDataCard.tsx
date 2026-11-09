import * as React from 'react'
import { Check, KeyRound } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Input } from '@renderer/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import {
  useClearYoutubeKey,
  useSetYoutubeKey,
  useSources
} from '@renderer/features/analysis/useAnalysis'

/** Fuentes de datos automáticas y gratuitas para el análisis de cuentas (Fase 9). */
export function AutoDataCard(): React.JSX.Element {
  const sources = useSources()
  const setKey = useSetYoutubeKey()
  const clearKey = useClearYoutubeKey()
  const [value, setValue] = React.useState('')
  const hasKey = sources.data?.youtubeApiKey ?? false
  const error = setKey.error ?? clearKey.error

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos automáticos</CardTitle>
        <CardDescription>
          Solo lo gratuito y oficial. Instagram: tu propia cuenta conectada en Cuentas. YouTube:
          datos públicos de cualquier canal con una clave de API de Google, gratis (cada lectura
          gasta 3 de las 10.000 unidades diarias). El resto de redes funcionan con capturas.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Clave de API de YouTube</p>
            <Badge tone={hasKey ? 'success' : 'neutral'}>
              {hasKey && <Check size={12} aria-hidden />}
              {hasKey ? 'Configurada' : 'Sin configurar'}
            </Badge>
          </div>
          {hasKey ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              onClick={() => clearKey.mutate(undefined)}
              disabled={clearKey.isPending}
            >
              Borrar clave de YouTube
            </Button>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                setKey.mutate({ apiKey: value }, { onSuccess: () => setValue('') })
              }}
            >
              <Input
                type="password"
                aria-label="Clave de API de YouTube"
                placeholder="Pega aquí la clave"
                className="w-72"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoComplete="off"
              />
              <Button size="sm" type="submit" disabled={!value.trim() || setKey.isPending}>
                <KeyRound aria-hidden /> Guardar clave de YouTube
              </Button>
            </form>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        )}
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
          <li>
            Entra en console.cloud.google.com y abre tu proyecto (el mismo de YouTube, si ya lo
            creaste).
          </li>
          <li>APIs y servicios → Biblioteca → activa «YouTube Data API v3».</li>
          <li>Credenciales → Crear credenciales → Clave de API.</li>
          <li>
            Restringe la clave a «YouTube Data API v3» y pégala aquí. Se guarda cifrada en tu
            equipo.
          </li>
        </ol>
      </CardContent>
    </Card>
  )
}
