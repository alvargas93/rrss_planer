import { Plus } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

/**
 * Fila superior con las cuentas conectadas, al estilo "historias": avatar redondo
 * con anillo degradado. En Fase 1 no hay cuentas; se muestra el botón de conectar
 * desactivado hasta la Fase 4.
 */
export function AccountsStrip(): React.JSX.Element {
  return (
    <div className="flex h-[72px] shrink-0 items-center gap-4 border-b border-border bg-surface/60 px-8 backdrop-blur">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled
            aria-label="Conectar una cuenta (disponible en la Fase 4)"
            className="group flex flex-col items-center gap-1 disabled:cursor-not-allowed"
          >
            <span className="grid size-11 place-items-center rounded-full border-2 border-dashed border-border-strong text-subtle transition-base group-enabled:hover:border-accent group-enabled:hover:text-accent">
              <Plus size={20} strokeWidth={1.75} aria-hidden />
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>Conectar cuenta · Fase 4</TooltipContent>
      </Tooltip>
      <p className="text-sm text-muted">Sin cuentas conectadas todavía.</p>
    </div>
  )
}
