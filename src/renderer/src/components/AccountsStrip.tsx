import { Link } from 'react-router'
import { Plus, Sparkles } from 'lucide-react'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { useAssistantUi } from '@renderer/features/ai/stores'
import { useAccounts } from '@renderer/features/accounts/useAccounts'
import { AccountAvatar } from '@renderer/features/accounts/AccountAvatar'
import { cn } from '@renderer/lib/utils'

/**
 * Fila superior: cuentas conectadas al estilo "historias" (avatar con anillo degradado),
 * botón para conectar más y, a la derecha, el asistente.
 */
export function AccountsStrip(): React.JSX.Element {
  const open = useAssistantUi((s) => s.open)
  const toggle = useAssistantUi((s) => s.toggle)
  const accounts = useAccounts()
  const list = accounts.data ?? []
  return (
    <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-border bg-surface/60 px-8 backdrop-blur">
      <ul className="flex items-center gap-3" aria-label="Cuentas conectadas">
        {list.map((account) => (
          <li key={account.id}>
            <Link to="/accounts" className="block rounded-full" aria-label={`@${account.username}`}>
              <AccountAvatar account={account} />
            </Link>
          </li>
        ))}
      </ul>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/accounts"
            aria-label="Conectar una cuenta"
            className="group flex flex-col items-center gap-1 rounded-full"
          >
            <span className="grid size-11 place-items-center rounded-full border-2 border-dashed border-border-strong text-subtle transition-base group-hover:border-accent group-hover:text-accent">
              <Plus size={20} strokeWidth={1.75} aria-hidden />
            </span>
          </Link>
        </TooltipTrigger>
        <TooltipContent>Conectar cuenta</TooltipContent>
      </Tooltip>
      {list.length === 0 && <p className="text-sm text-muted">Sin cuentas conectadas todavía.</p>}
      <Button
        variant={open ? 'primary' : 'outline'}
        className={cn('ml-auto', !open && 'text-accent')}
        aria-pressed={open}
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'}
        onClick={toggle}
      >
        <Sparkles aria-hidden /> Asistente
      </Button>
    </div>
  )
}
