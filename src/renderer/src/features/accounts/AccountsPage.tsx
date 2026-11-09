import * as React from 'react'
import { Info, Plus, RefreshCw, Unplug, Users } from 'lucide-react'
import { ACCOUNT_STATUS_LABELS, type Account, type OAuthNetwork } from '@shared/domain/accounts'
import { NETWORKS, type Network } from '@shared/connectors/networks'
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
import { ConnectOAuthDialog } from './ConnectOAuthDialog'
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
  onDisconnect,
  onReconnect
}: {
  account: Account
  onDisconnect: () => void
  onReconnect: () => void
}): React.JSX.Element {
  const refresh = useRefreshAccount()
  const caps = useCapabilities(account.network)
  const manualRenewal = caps.data?.autoRefresh === false
  const followers =
    typeof account.meta['followersCount'] === 'number'
      ? (account.meta['followersCount'] as number)
      : null
  const assumed = account.meta['expiryAssumed'] === true
  const renewsPerUse = typeof account.meta['accessExpiresAt'] === 'string'
  const expiryText = renewsPerUse
    ? 'El acceso se renueva solo cada vez que se usa.'
    : account.tokenExpiresAt
      ? `El acceso caduca el ${fmtDay(account.tokenExpiresAt)}${assumed ? ' (estimado)' : ''}; ${
          manualRenewal ? 'para renovarlo hay que volver a autorizar.' : 'se renueva solo.'
        }`
      : 'Sin fecha de caducidad conocida.'
  return (
    <li className="flex gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <AccountAvatar account={account} size={56} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[15px] font-semibold">
            {account.network === 'linkedin' ? account.displayName : `@${account.username}`}
          </p>
          <Badge tone="neutral">{NETWORK_META[account.network].label}</Badge>
          <Badge tone={STATUS_TONE[account.status]}>{ACCOUNT_STATUS_LABELS[account.status]}</Badge>
        </div>
        <p className="text-sm text-muted">
          {account.displayName}
          {account.accountType !== 'unknown' && ` · ${account.accountType}`}
          {followers !== null && ` · ${followers.toLocaleString('es')} seguidores`}
        </p>
        <p className="mt-1 text-xs text-subtle">
          {expiryText}
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
        {manualRenewal ? (
          <Button size="sm" variant="outline" onClick={onReconnect}>
            <RefreshCw aria-hidden /> Reconectar
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => refresh.mutate({ id: account.id })}
            disabled={refresh.isPending}
          >
            <RefreshCw aria-hidden className={refresh.isPending ? 'animate-spin' : ''} /> Renovar
            acceso
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-danger" onClick={onDisconnect}>
          <Unplug aria-hidden /> Desconectar
        </Button>
      </div>
    </li>
  )
}

function NetworkNotes({ network }: { network: Network }): React.JSX.Element | null {
  const caps = useCapabilities(network)
  if (!caps.data) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info size={16} aria-hidden /> Qué permite {NETWORK_META[network].label} por API
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
            Texto de hasta {caps.data.maxChars} caracteres
            {caps.data.maxHashtags !== null ? ` y ${caps.data.maxHashtags} hashtags` : ''}.
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
  const [instagramOpen, setInstagramOpen] = React.useState(false)
  const [oauthNetwork, setOauthNetwork] = React.useState<OAuthNetwork | null>(null)
  const [toDisconnect, setToDisconnect] = React.useState<Account | null>(null)

  const connect = (network: Network): void => {
    if (network === 'instagram') setInstagramOpen(true)
    else setOauthNetwork(network)
  }

  const connectButtons = NETWORKS.map((network) => (
    <Button key={network} variant="outline" onClick={() => connect(network)}>
      <Plus aria-hidden /> {NETWORK_META[network].label}
    </Button>
  ))

  return (
    <>
      <PageHeader
        title="Cuentas"
        description="Las redes conectadas por API oficial. Sin cuenta conectada, cada red funciona en modo manual: la app te avisa a la hora y te deja el texto copiado."
        actions={<div className="flex flex-wrap gap-2">{connectButtons}</div>}
      />

      {host.data && !host.data.configured && (
        <p className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <strong>Falta el alojamiento de medios.</strong> Instagram exige que las imágenes y vídeos
          estén en una URL pública al publicar. Configura Cloudinary en Ajustes → Publicación o las
          publicaciones de Instagram con archivos irán en modo manual. YouTube, LinkedIn y X no lo
          necesitan.
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
                onReconnect={() => connect(account.network)}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Users}
            title="Sin cuentas conectadas"
            description="Conecta una red para publicar y programar desde aquí. Cada una usa su API oficial y una app que creas tú en su portal de desarrolladores."
          />
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {NETWORKS.map((network) => (
            <NetworkNotes key={network} network={network} />
          ))}
        </div>
      </div>

      <ConnectInstagramDialog open={instagramOpen} onOpenChange={setInstagramOpen} />
      <ConnectOAuthDialog
        network={oauthNetwork}
        onOpenChange={(open) => !open && setOauthNetwork(null)}
      />
      <ConfirmDialog
        open={toDisconnect !== null}
        onOpenChange={(open) => !open && setToDisconnect(null)}
        title={`¿Desconectar ${toDisconnect?.displayName ?? ''}?`}
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
