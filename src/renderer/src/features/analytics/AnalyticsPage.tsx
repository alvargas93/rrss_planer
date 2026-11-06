import * as React from 'react'
import { Link } from 'react-router'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ExternalLink,
  RefreshCw,
  Sparkles
} from 'lucide-react'
import {
  METRIC_LABELS,
  type AnalyticsQuery,
  type RemoteMedia,
  type Stat
} from '@shared/domain/analytics'
import { PageHeader } from '@renderer/components/PageHeader'
import { EmptyState } from '@renderer/components/EmptyState'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Segmented } from '@renderer/components/ui/segmented'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { invoke } from '@renderer/lib/ipc'
import { fmtDateTime, fmtDay, fmtRelative } from '@renderer/lib/dates'
import { cn } from '@renderer/lib/utils'
import { useAccounts } from '@renderer/features/accounts/useAccounts'
import { useAssistantUi, useScreenContextStore } from '@renderer/features/ai/stores'
import { useScreenContext } from '@renderer/features/ai/useScreenContext'
import { useRunAction } from '@renderer/features/ai/useAi'
import { ActionResultCard } from '@renderer/features/ai/ActionResultCard'
import { BarsChart, TrendChart } from './charts'
import { useAnalyticsDigest, useAnalyticsOverview, useSyncAnalytics } from './useAnalytics'

type Days = AnalyticsQuery['days']

function StatTile({ stat }: { stat: Stat }): React.JSX.Element {
  const change = stat.change
  const up = change !== null && change > 0
  const down = change !== null && change < 0
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface p-4 shadow-sm',
        !stat.available && 'opacity-60'
      )}
    >
      <p className="text-xs text-muted">{stat.label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">
        {stat.available ? Math.round(stat.value).toLocaleString('es') : '—'}
      </p>
      {stat.available && change !== null && (
        <p
          className={cn(
            'mt-0.5 inline-flex items-center gap-0.5 text-xs font-medium',
            up ? 'text-success' : down ? 'text-danger' : 'text-muted'
          )}
        >
          {up ? (
            <ArrowUpRight size={14} aria-hidden />
          ) : down ? (
            <ArrowDownRight size={14} aria-hidden />
          ) : null}
          {change >= 0 ? '+' : ''}
          {Math.round(change * 100)} %<span className="sr-only"> frente al periodo anterior</span>
        </p>
      )}
      {!stat.available && <p className="mt-0.5 text-xs text-subtle">No disponible</p>}
    </div>
  )
}

function MediaRow({ media }: { media: RemoteMedia }): React.JSX.Element {
  const reach = media.insights['reach']
  const views = media.insights['views']
  const saved = media.insights['saved']
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="size-12 shrink-0 overflow-hidden rounded-sm bg-surface-2">
        {media.thumbnailUrl ? (
          <img src={media.thumbnailUrl} alt="" className="size-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {media.caption ? media.caption.replace(/\s+/g, ' ').slice(0, 80) : 'Sin texto'}
        </p>
        <p className="text-xs text-muted">
          {fmtDay(media.publishedAt)} · {media.productType || media.mediaType}
          {media.postId && (
            <>
              {' · '}
              <Link to={`/compose/${media.postId}`} className="text-accent hover:underline">
                abrir en la app
              </Link>
            </>
          )}
        </p>
      </div>
      <dl className="grid shrink-0 grid-cols-3 gap-3 text-right text-xs">
        <div>
          <dt className="text-subtle">Me gusta</dt>
          <dd className="font-semibold">{media.likeCount.toLocaleString('es')}</dd>
        </div>
        <div>
          <dt className="text-subtle">
            {reach !== undefined ? 'Alcance' : views !== undefined ? 'Visualiz.' : 'Coment.'}
          </dt>
          <dd className="font-semibold">
            {(reach ?? views ?? media.commentsCount).toLocaleString('es')}
          </dd>
        </div>
        <div>
          <dt className="text-subtle">Guardados</dt>
          <dd className="font-semibold">
            {saved !== undefined ? saved.toLocaleString('es') : '—'}
          </dd>
        </div>
      </dl>
      {media.permalink && (
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label="Ver en Instagram"
          onClick={() => void invoke('app:openExternal', { url: media.permalink! })}
        >
          <ExternalLink aria-hidden />
        </Button>
      )}
    </li>
  )
}

export function AnalyticsPage(): React.JSX.Element {
  const accounts = useAccounts()
  const [accountId, setAccountId] = React.useState<string | null>(null)
  const [days, setDays] = React.useState<Days>(30)
  const list = accounts.data ?? []
  const selected = accountId ?? list[0]?.id ?? null
  const query: AnalyticsQuery | null = selected ? { accountId: selected, days } : null
  const overview = useAnalyticsOverview(query)
  const digest = useAnalyticsDigest(query)
  const sync = useSyncAnalytics()
  const runSummary = useRunAction()
  const context = useScreenContextStore((s) => s.context)
  const setConversationId = useAssistantUi((s) => s.setConversationId)

  useScreenContext({ screen: 'analytics', extra: digest.data?.text })

  const o = overview.data
  const hasData = !!o && o.stats.some((s) => s.available)

  return (
    <>
      <PageHeader
        title="Analítica"
        description="Métricas de tus cuentas conectadas, leídas de la API oficial. Se actualizan solas una vez al día."
        actions={
          <>
            {list.length > 1 && (
              <Select value={selected ?? ''} onValueChange={setAccountId}>
                <SelectTrigger className="w-48" aria-label="Cuenta">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {list.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      @{a.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Segmented
              aria-label="Periodo"
              value={String(days)}
              onChange={(v) => setDays(Number(v) as Days)}
              options={[
                { value: '7', label: '7 días' },
                { value: '30', label: '30 días' },
                { value: '90', label: '90 días' }
              ]}
            />
            <Button
              variant="outline"
              onClick={() => sync.mutate({ accountId: selected ?? undefined })}
              disabled={!selected || sync.isPending}
            >
              <RefreshCw aria-hidden className={sync.isPending ? 'animate-spin' : ''} /> Actualizar
            </Button>
          </>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Sin cuentas conectadas"
          description="Conecta una cuenta de Instagram para ver alcance, interacciones, seguidores y tus mejores publicaciones."
          action={
            <Button asChild>
              <Link to="/accounts">Ir a Cuentas</Link>
            </Button>
          }
        />
      ) : overview.isPending ? (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : o ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>
              Datos de {fmtDay(`${o.from}T12:00:00`)} a {fmtDay(`${o.to}T12:00:00`)}.
            </span>
            {o.lastSyncAt ? (
              <span>Última actualización {fmtRelative(o.lastSyncAt)}.</span>
            ) : (
              <span>Aún no se han descargado métricas: pulsa Actualizar.</span>
            )}
            {o.lastError && (
              <Badge tone="danger" className="normal-case">
                {o.lastError}
              </Badge>
            )}
            {sync.data && sync.data[0] && !sync.data[0].ok && (
              <Badge tone="danger">{sync.data[0].message}</Badge>
            )}
            {o.unavailable.length > 0 && (
              <span>
                No disponibles para esta cuenta:{' '}
                {o.unavailable.map((m) => METRIC_LABELS[m] ?? m).join(', ')}.
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {o.stats
              .filter((s) =>
                [
                  'followers_count',
                  'reach',
                  'views',
                  'total_interactions',
                  'profile_links_taps'
                ].includes(s.metric)
              )
              .map((s) => (
                <StatTile key={s.metric} stat={s} />
              ))}
          </div>

          {!hasData ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted">
                Todavía no hay datos. Las métricas diarias se acumulan desde que conectas la cuenta
                (Instagram solo facilita series históricas para el alcance). Pulsa{' '}
                <strong>Actualizar</strong> para traer los primeros 14 días disponibles.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Alcance por día</CardTitle>
                  <CardDescription>Cuentas únicas que vieron tu contenido.</CardDescription>
                </CardHeader>
                <CardContent>
                  {(o.series['reach']?.length ?? 0) > 1 ? (
                    <TrendChart points={o.series['reach'] ?? []} />
                  ) : (
                    <p className="text-sm text-muted">Sin serie de alcance todavía.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Interacciones por día</CardTitle>
                  <CardDescription>Me gusta, comentarios, guardados y compartidos.</CardDescription>
                </CardHeader>
                <CardContent>
                  {(o.series['total_interactions']?.length ?? 0) > 0 ? (
                    <BarsChart points={o.series['total_interactions'] ?? []} />
                  ) : (
                    <p className="text-sm text-muted">
                      Se irán acumulando con cada actualización diaria.
                    </p>
                  )}
                </CardContent>
              </Card>
              {(o.series['followers_count']?.length ?? 0) > 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Seguidores</CardTitle>
                    <CardDescription>Un punto por día de actualización.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TrendChart points={o.series['followers_count'] ?? []} height={180} />
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Mejores publicaciones</CardTitle>
                <CardDescription>
                  Ordenadas por alcance (o me gusta si no hay insights).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {o.topMedia.length === 0 ? (
                  <p className="text-sm text-muted">Sin publicaciones descargadas todavía.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {o.topMedia.map((m) => (
                      <MediaRow key={m.id} media={m} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles size={16} className="text-accent" aria-hidden /> Resumen con Claude
                </CardTitle>
                <CardDescription>
                  Qué funcionó, qué cambiar y en qué centrarse la semana que viene, a partir de
                  estas cifras.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div>
                  <Button
                    onClick={() =>
                      runSummary.mutate(
                        {
                          conversationId: null,
                          kind: 'summary',
                          instruction: '',
                          networks: [],
                          context
                        },
                        { onSuccess: (m) => setConversationId(m.conversationId) }
                      )
                    }
                    disabled={!hasData || runSummary.isPending || !digest.data}
                  >
                    <Sparkles aria-hidden />{' '}
                    {runSummary.isPending ? 'Redactando…' : 'Generar resumen'}
                  </Button>
                  {!hasData && (
                    <p className="mt-2 text-xs text-muted">Necesita métricas descargadas.</p>
                  )}
                </div>
                {runSummary.error && (
                  <p role="alert" className="text-sm text-danger">
                    {runSummary.error.message}
                  </p>
                )}
                {runSummary.data?.blocks.map((block, i) =>
                  block.type === 'action' ? (
                    <ActionResultCard key={i} block={block} />
                  ) : block.type === 'error' ? (
                    <p key={i} className="text-sm text-warning">
                      {block.message}
                    </p>
                  ) : null
                )}
                {runSummary.data && (
                  <p className="text-[11px] text-subtle">
                    Guardado en el historial del asistente ·{' '}
                    {fmtDateTime(runSummary.data.createdAt)}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  )
}
