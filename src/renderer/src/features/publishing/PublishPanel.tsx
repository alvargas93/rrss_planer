import * as React from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RotateCcw,
  Send,
  XCircle
} from 'lucide-react'
import { TARGET_STATUS_LABELS, type PostTarget } from '@shared/domain/publishing'
import { NETWORK_META, type Network } from '@shared/connectors/networks'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { invoke } from '@renderer/lib/ipc'
import { fmtDateTime } from '@renderer/lib/dates'
import { useAccounts } from '@renderer/features/accounts/useAccounts'
import {
  useCancelTarget,
  usePublishNow,
  useRetryTarget,
  useSetTarget,
  useValidation
} from './usePublishing'

const MANUAL = '__manual__'
const TONE = {
  pending: 'neutral',
  queued: 'info',
  publishing: 'info',
  published: 'success',
  failed: 'danger',
  manual_notified: 'warning',
  cancelled: 'neutral'
} as const

interface PublishPanelProps {
  postId: string
  targets: PostTarget[]
  networks: Network[]
  dirty: boolean
  scheduledAt: string | null
}

/** Estado de publicación por red: cuenta de destino, validación, publicar ahora. */
export function PublishPanel({
  postId,
  targets,
  networks,
  dirty,
  scheduledAt
}: PublishPanelProps): React.JSX.Element {
  const accounts = useAccounts()
  const validation = useValidation(postId)
  const setTarget = useSetTarget()
  const publishNow = usePublishNow()
  const retry = useRetryTarget()
  const cancel = useCancelTarget()
  const [confirm, setConfirm] = React.useState<{ network: Network; targetId: string } | null>(null)

  const anyErrors = Object.values(validation.data ?? {}).some((issues) =>
    issues.some((i) => i.level === 'error')
  )

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Publicación</p>
        {scheduledAt && (
          <span className="text-xs text-muted">Programada: {fmtDateTime(scheduledAt)}</span>
        )}
      </div>
      {dirty && <p className="text-xs text-warning">Guarda los cambios antes de publicar.</p>}
      {networks.length === 0 && (
        <p className="text-sm text-muted">Activa una red para poder publicar.</p>
      )}

      <ul className="flex flex-col gap-3">
        {networks.map((network) => {
          const target = targets.find((t) => t.network === network)
          const issues = validation.data?.[network] ?? []
          const candidates = (accounts.data ?? []).filter((a) => a.network === network)
          const status = target?.status ?? 'pending'
          const busy = publishNow.isPending || setTarget.isPending
          const canPublish =
            !dirty &&
            target &&
            status !== 'published' &&
            status !== 'publishing' &&
            !issues.some((i) => i.level === 'error') &&
            target.mode === 'api'
          return (
            <li key={network} className="flex flex-col gap-2 rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{NETWORK_META[network].label}</span>
                <Badge tone={TONE[status]}>
                  {status === 'publishing' && (
                    <Loader2 size={10} className="animate-spin" aria-hidden />
                  )}
                  {TARGET_STATUS_LABELS[status]}
                </Badge>
                {target?.externalUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7"
                    onClick={() => void invoke('app:openExternal', { url: target.externalUrl! })}
                  >
                    <ExternalLink aria-hidden /> Ver
                  </Button>
                )}
              </div>
              <Select
                value={target?.mode === 'manual' || !target?.accountId ? MANUAL : target.accountId}
                onValueChange={(value) =>
                  setTarget.mutate({
                    postId,
                    network,
                    accountId: value === MANUAL ? null : value,
                    mode: value === MANUAL ? 'manual' : 'api'
                  })
                }
                disabled={status === 'published' || status === 'publishing' || dirty}
              >
                <SelectTrigger
                  aria-label={`Cuenta de destino para ${NETWORK_META[network].label}`}
                  className="h-8 text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={MANUAL}>Manual (aviso a la hora, sin publicar)</SelectItem>
                  {candidates.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      @{a.username} · por API
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {issues.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {issues.map((issue, i) => (
                    <li
                      key={i}
                      className={`flex items-start gap-1.5 text-xs ${issue.level === 'error' ? 'text-danger' : 'text-warning'}`}
                    >
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />{' '}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}
              {target?.lastError && status !== 'published' && (
                <p className="flex items-start gap-1.5 text-xs text-danger">
                  <XCircle size={13} className="mt-0.5 shrink-0" aria-hidden /> {target.lastError}
                  {target.nextAttemptAt && ` Reintento ${fmtDateTime(target.nextAttemptAt)}.`}
                </p>
              )}
              {status === 'published' && target?.publishedAt && (
                <p className="flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle2 size={13} aria-hidden /> Publicada el{' '}
                  {fmtDateTime(target.publishedAt)}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {target && canPublish && (
                  <Button
                    size="sm"
                    onClick={() => setConfirm({ network, targetId: target.id })}
                    disabled={busy}
                  >
                    <Send aria-hidden /> Publicar ahora
                  </Button>
                )}
                {target && status === 'failed' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retry.mutate({ targetId: target.id })}
                    disabled={retry.isPending}
                  >
                    <RotateCcw aria-hidden /> Volver a intentar a su hora
                  </Button>
                )}
                {target &&
                  (status === 'pending' || status === 'queued' || status === 'failed') &&
                  scheduledAt && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => cancel.mutate({ targetId: target.id })}
                      disabled={cancel.isPending}
                    >
                      Cancelar
                    </Button>
                  )}
              </div>
            </li>
          )
        })}
      </ul>
      {anyErrors && (
        <p className="text-xs text-muted">
          Corrige los errores marcados: la publicación por API se bloquea si no cumplen las reglas
          de la red.
        </p>
      )}
      {(publishNow.error ?? setTarget.error) && (
        <p role="alert" className="text-sm text-danger">
          {(publishNow.error ?? setTarget.error)?.message}
        </p>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`¿Publicar ahora en ${confirm ? NETWORK_META[confirm.network].label : ''}?`}
        description="Se publicará de inmediato en tu cuenta. Esta acción no se puede deshacer desde la app."
        confirmLabel="Sí, publicar"
        pending={publishNow.isPending}
        onConfirm={() =>
          confirm &&
          publishNow.mutate(
            { postId, targetId: confirm.targetId },
            { onSettled: () => setConfirm(null) }
          )
        }
      />
    </section>
  )
}
