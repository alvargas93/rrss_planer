import type { Account } from '@shared/domain/accounts'
import { NETWORK_META } from '@shared/connectors/networks'
import { cn } from '@renderer/lib/utils'

/** Avatar redondo con anillo degradado (estilo "historias"). Gris si hay problemas. */
export function AccountAvatar({
  account,
  size = 44,
  className
}: {
  account: Account
  size?: number
  className?: string
}): React.JSX.Element {
  const healthy = account.status === 'connected' || account.status === 'expiring'
  const initial = (account.username || '?').slice(0, 1).toUpperCase()
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full p-[2px]',
        healthy ? 'bg-accent-gradient' : 'bg-border-strong',
        className
      )}
      style={{ width: size, height: size }}
      title={`@${account.username} · ${NETWORK_META[account.network].label}`}
    >
      <span className="grid size-full place-items-center overflow-hidden rounded-full border-2 border-surface bg-surface-2 text-sm font-semibold text-muted">
        {account.avatarUrl ? (
          <img
            src={account.avatarUrl}
            alt=""
            className="size-full object-cover"
            draggable={false}
          />
        ) : (
          initial
        )}
      </span>
    </span>
  )
}
