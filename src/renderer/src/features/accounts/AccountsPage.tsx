import * as React from 'react'
import { Info, Plus, RefreshCw, Unplug, Users } from 'lucide-react'
import { ACCOUNT_STATUS_LABELS, type Account } from '@shared/domain/accounts'
import { NETWORK_META } from '@shared/connectors/networks'
import { PageHeader } from '@renderer/components/PageHeader'
import { EmptyState } from '@renderer/components/EmptyState'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { fmtDay, fmtRelative } from '@renderer/lib/dates'
import { useScreenContext } from '@renderer/features/ai/useScreenContext'
import { useHostStatus } from '@renderer/features/publishing/usePublishing'
import { AccountAvatar } from './AccountAvatar'
import { ConnectInstagramDialog } from './ConnectInstagramDialog'
import {
  useAccounts,
  useCapabilities,
  useDisconnectAccount,
  useRefreshAccount
} from './useAccounts'

const STATUS_TONE = {
  connected: 'success',
  expiring: 'warning',
  expired: 'danger',
  revoked: 'neutral',
  error: 'danger'
} as const

function AccountCard({
  account,
  onDisconnect
}: {
  account: Account
  onDisconnect: () => void
}): React.JSX.Element {
  const refresh = useRefreshAccount()
  const followers =
    typeof account.meta['followersCount'] === 'number'
      ? (account.meta['followersCount'] as number)
      : null
  const assumed = account.meta['expiryAssumed'] === true
  return (
    <li className="flex gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <AccountAvatar account={account} size={56} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[15px] font-semibold">@{account.username}</p>
          <Badge tone="neutral">{NETWORK_META[account.network].label}</Badge>
          <Badge tone={STATUS_TONE[account.status]}>{ACCOUNT_STATUS_LABELS[account.status]}</Badge>
        </div>
        <p className="text-sm text-muted">
          {account.displayName}
          {account.accountType !== 'unknown' && ` · ${account.accountType}`}
          {followers !== null && ` · ${followers.toLocaleString('es')} seguidores`}
        </p>
        <p className="mt-1 text-xs text-subtle">
          {account.tokenExpiresAt
            ? `El acceso caduca el ${fmtDay(account.tokenExpiresAt)}${assumed ? ' (estimado)' : ''}; se renueva solo.`
            : 'Sin fecha de caducidad conocida.'}
          {account.tokenRefreshedAt &&
            ` Última renovación ${fmtRelative(account.tokenRefreshedAt)}.`}
        </p>
        {account.lastError && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {account.lastError}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => refresh.mutate({ id: account.id })}
          disabled={refresh.isPending}
        >
          <RefreshCw aria-hidden className={refresh.isPending ? 'animate-spin' : ''} /> Renovar
          acceso
        </Button>
        <Button size="sm" variant="ghost" className="text-danger" onClick={onDisconnect}>
          <Unplug aria-hidden /> Desconectar
        </Button>
      </div>
    </li>
  )
}

function InstagramNotes(): React.JSX.Element | null {
  const caps = useCapabilities('instagram')
  if (!caps.data) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info size={16} aria-hidden /> Qué permite Instagram por API
        </CardTitle>
        <CardDescription>
          Verificado contra la documentación oficial. Formatos:{' '}
          {Object.keys(caps.data.kinds).join(', ')}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {caps.data.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
          <li>
            Pie de hasta {caps.data.maxChars} caracteres y {caps.data.maxHashtags} hashtags; texto
            alternativo hasta {caps.data.altTextMaxChars} caracteres.
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}

export function AccountsPage(): React.JSX.Element {
  useScreenContext({ screen: 'other' })
  const accounts = useAccounts()
  const host = useHostStatus()
  const disconnect = useDisconnectAccount()
  const [connectOpen, setConnectOpen] = React.useState(false)
  const [toDisconnect, setToDisconnect] = React.useState<Account | null>(null)

  return (
    <>
      <PageHeader
        title="Cuentas"
        description="Las redes conectadas por API oficial. Sin cuenta conectada, cada red funciona en modo manual: la app te avisa a la hora y te deja el texto copiado."
        actions={
          <Button onClick={() => setConnectOpen(true)}>
            <Plus aria-hidden /> Conectar Instagram
          </Button>
        }
      />

      {host.data && !host.data.configured && (
        <p className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <strong>Falta el alojamiento de medios.</strong> Instagram exige que las imágenes y vídeos
          estén en una URL pública al publicar. Configura Cloudinary en Ajustes → Publicación o las
          publicaciones con archivos irán en modo manual.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {accounts.isPending ? (
          <Skeleton className="h-28" />
        ) : accounts.data && accounts.data.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {accounts.data.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onDisconnect={() => setToDisconnect(account)}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Users}
            title="Sin cuentas conectadas"
            description="Conecta tu cuenta profesional de Instagram para publicar y programar desde aquí. LinkedIn, X y YouTube llegan en la Fase 7."
            action={
              <Button onClick={() => setConnectOpen(true)}>
                <Plus aria-hidden /> Conectar Instagram
              </Button>
            }
          />
        )}
        <InstagramNotes />
      </div>

      <ConnectInstagramDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <ConfirmDialog
        open={toDisconnect !== null}
        onOpenChange={(open) => !open && setToDisconnect(null)}
        title={`¿Desconectar @${toDisconnect?.username}?`}
        description="Se borra el token de tu equipo. Las publicaciones ya hechas no se tocan; las pendientes pasarán a modo manual."
        confirmLabel="Desconectar"
        destructive
        pending={disconnect.isPending}
        onConfirm={() =>
          toDisconnect &&
          disconnect.mutate({ id: toDisconnect.id }, { onSuccess: () => setToDisconnect(null) })
        }
      />
    </>
  )
}
