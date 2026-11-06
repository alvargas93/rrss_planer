import * as React from 'react'
import { Check, Eye, EyeOff, KeyRound, Loader2, PlugZap, Trash2 } from 'lucide-react'
import { DEFAULT_PRICING, type ModelInfo, type ModelPrice } from '@shared/domain/ai'
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
import { Input } from '@renderer/components/ui/input'
import { Segmented } from '@renderer/components/ui/segmented'
import { Switch } from '@renderer/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'
import {
  useAiStatus,
  useClearApiKey,
  useSetApiKey,
  useTestConnection,
  useUsageHistory
} from '@renderer/features/ai/useAi'
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

function PricingTable({
  pricing,
  onChange
}: {
  pricing: Record<string, ModelPrice>
  onChange: (pricing: Record<string, ModelPrice>) => void
}): React.JSX.Element {
  const models = Object.keys(pricing).sort()
  const edit = (model: string, field: keyof ModelPrice, value: string): void => {
    const n = Number(value)
    if (Number.isNaN(n) || n < 0) return
    const current = pricing[model]
    if (!current) return
    onChange({ ...pricing, [model]: { ...current, [field]: n } })
  }
  return (
    <table className="w-full text-xs">
      <thead className="text-subtle">
        <tr>
          <th className="py-1 text-left font-medium">Modelo</th>
          <th className="py-1 text-right font-medium">Entrada</th>
          <th className="py-1 text-right font-medium">Salida</th>
          <th className="py-1 text-right font-medium">Caché lect.</th>
          <th className="py-1 text-right font-medium">Caché escr.</th>
        </tr>
      </thead>
      <tbody>
        {models.map((model) => {
          const price = pricing[model]!
          return (
            <tr key={model} className="border-t border-border">
              <td className="py-1 pr-2 font-mono text-[11px]">{model}</td>
              {(
                ['inputPerMTok', 'outputPerMTok', 'cacheReadPerMTok', 'cacheWritePerMTok'] as const
              ).map((field) => (
                <td key={field} className="py-1 pl-2">
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    aria-label={`${model} ${field}`}
                    className="h-7 w-20 text-right text-xs"
                    defaultValue={price[field]}
                    onBlur={(e) => edit(model, field, e.target.value)}
                  />
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function AiSettingsCard({ settings }: { settings: Settings }): React.JSX.Element {
  const status = useAiStatus()
  const setKey = useSetApiKey()
  const clearKey = useClearApiKey()
  const test = useTestConnection()
  const history = useUsageHistory()
  const update = useUpdateSettings()
  const [apiKey, setApiKey] = React.useState('')
  const [showKey, setShowKey] = React.useState(false)
  const ai = settings.ai
  const models: ModelInfo[] = test.data ?? []
  const modelOptions = Array.from(
    new Set([ai.model, ...Object.keys(ai.pricing), ...models.map((m) => m.id)])
  )

  const saveKey = (): void => {
    if (apiKey.trim().length < 10) return
    setKey.mutate({ apiKey: apiKey.trim() }, { onSuccess: () => setApiKey('') })
  }

  const usage = status.data?.usage
  const pct =
    usage && ai.monthlyLimitUsd
      ? Math.min(100, Math.round((usage.costUsd / ai.monthlyLimitUsd) * 100))
      : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Claude</CardTitle>
        <CardDescription>
          Tu clave de API de Anthropic se guarda cifrada con el almacén del sistema. Claude solo
          propone: nada se publica ni se borra sin que lo confirmes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Row
          label="Clave de API"
          hint={
            status.data?.hasKey
              ? `Guardada (termina en …${status.data.keyHint}).`
              : 'Consíguela en console.anthropic.com → API Keys.'
          }
        >
          <div className="flex items-center gap-2">
            {status.data?.hasKey ? (
              <>
                <Badge tone="success">
                  <Check size={12} aria-hidden /> Configurada
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  onClick={() => clearKey.mutate(undefined)}
                  disabled={clearKey.isPending}
                >
                  <Trash2 aria-hidden /> Quitar
                </Button>
              </>
            ) : null}
          </div>
        </Row>
        <div className="flex gap-2 py-3 not-last:border-b not-last:border-border">
          <div className="relative flex-1">
            <KeyRound
              size={16}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-subtle"
              aria-hidden
            />
            <Input
              type={showKey ? 'text' : 'password'}
              aria-label="Nueva clave de API"
              placeholder={
                status.data?.hasKey ? 'Pega una clave nueva para sustituirla' : 'sk-ant-…'
              }
              className="pr-9 pl-9 font-mono text-xs"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveKey()}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              aria-label={showKey ? 'Ocultar clave' : 'Mostrar clave'}
              onClick={() => setShowKey((v) => !v)}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 text-subtle hover:text-text"
            >
              {showKey ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
            </button>
          </div>
          <Button onClick={saveKey} disabled={apiKey.trim().length < 10 || setKey.isPending}>
            Guardar clave
          </Button>
          <Button
            variant="outline"
            onClick={() => test.mutate(undefined)}
            disabled={!status.data?.hasKey || test.isPending}
          >
            {test.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <PlugZap aria-hidden />
            )}{' '}
            Probar conexión
          </Button>
        </div>
        {status.data && !status.data.encryptionAvailable && (
          <p role="alert" className="pb-3 text-sm text-danger">
            El cifrado del sistema no está disponible; no se puede guardar la clave de forma segura.
          </p>
        )}
        {(setKey.error ?? clearKey.error ?? test.error) && (
          <p role="alert" className="pb-3 text-sm text-danger">
            {(setKey.error ?? clearKey.error ?? test.error)?.message}
          </p>
        )}
        {test.isSuccess && (
          <p className="pb-3 text-sm text-success">
            Conexión correcta. {models.length} modelos disponibles para tu cuenta.
          </p>
        )}

        <Row
          label="Modelo"
          hint={
            status.data && !status.data.modelPriced
              ? 'Sin precio en la tabla: el coste se estimará con el modelo por defecto.'
              : 'Opus 5.5 es el más capaz; Sonnet 5.5 cuesta la mitad; Haiku 5.5 es el más barato.'
          }
        >
          <Select value={ai.model} onValueChange={(model) => update.mutate({ ai: { model } })}>
            <SelectTrigger className="w-64" aria-label="Modelo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((id) => {
                const info = models.find((m) => m.id === id)
                return (
                  <SelectItem key={id} value={id}>
                    {info ? `${info.displayName} (${id})` : id}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </Row>
        <Row
          label="Esfuerzo de razonamiento"
          hint="Más alto: mejores respuestas, más lentas y caras."
        >
          <Segmented
            aria-label="Esfuerzo"
            value={ai.effort}
            onChange={(effort) => update.mutate({ ai: { effort } })}
            options={[
              { value: 'low', label: 'Bajo' },
              { value: 'medium', label: 'Medio' },
              { value: 'high', label: 'Alto' }
            ]}
          />
        </Row>
        <Row
          label="Reintentar si Claude declina"
          hint="Si rechaza una petición por seguridad, la API la reintenta con otro modelo."
        >
          <Switch
            aria-label="Reintentar si Claude declina"
            checked={ai.refusalFallback}
            onCheckedChange={(refusalFallback) => update.mutate({ ai: { refusalFallback } })}
          />
        </Row>
        <Row
          label="Límite mensual (USD)"
          hint="Al alcanzarlo, el asistente se detiene hasta el mes siguiente o hasta que lo subas. Vacío = sin límite."
        >
          <Input
            type="number"
            min={0}
            step={1}
            aria-label="Límite mensual en dólares"
            className="w-28 text-right"
            defaultValue={ai.monthlyLimitUsd ?? ''}
            onBlur={(e) => {
              const value = e.target.value.trim()
              update.mutate({
                ai: { monthlyLimitUsd: value === '' ? null : Math.max(0, Number(value)) }
              })
            }}
          />
        </Row>

        <div className="py-3 not-last:border-b not-last:border-border">
          <p className="text-sm font-medium">Uso este mes</p>
          {usage ? (
            <>
              <p className="mt-1 text-xs text-muted">
                {usage.calls} llamadas · {usage.inputTokens.toLocaleString('es')} tokens de entrada
                · {usage.outputTokens.toLocaleString('es')} de salida ·{' '}
                <span className="font-semibold text-text">{usage.costUsd.toFixed(2)} $</span>
                {ai.monthlyLimitUsd !== null && ` de ${ai.monthlyLimitUsd} $`}
              </p>
              {pct !== null && (
                <div
                  className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-3"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Gasto del mes"
                >
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width]',
                      pct >= 100
                        ? 'bg-danger'
                        : pct >= ai.warnAtPercent
                          ? 'bg-warning'
                          : 'bg-accent-gradient'
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </>
          ) : (
            <p className="mt-1 text-xs text-muted">Cargando…</p>
          )}
          {history.data && history.data.length > 1 && (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-subtle">
              {history.data.map((h) => (
                <li key={h.month}>
                  {h.month}: {h.costUsd.toFixed(2)} $
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="py-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Precios por millón de tokens (USD)</p>
              <p className="text-xs text-muted">
                Para la estimación de coste. Actualízalos si Anthropic cambia tarifas.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => update.mutate({ ai: { pricing: { ...DEFAULT_PRICING } } })}
            >
              Restaurar
            </Button>
          </div>
          <PricingTable
            pricing={ai.pricing}
            onChange={(pricing) => update.mutate({ ai: { pricing } })}
          />
        </div>
      </CardContent>
    </Card>
  )
}
