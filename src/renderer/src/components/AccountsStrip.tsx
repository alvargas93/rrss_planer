import { Plus, Sparkles } from 'lucide-react'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { useAssistantUi } from '@renderer/features/ai/stores'
import { cn } from '@renderer/lib/utils'

/**
 * Fila superior: cuentas conectadas al estilo "historias" (avatar con anillo degradado)
 * y, a la derecha, el botón del asistente. Sin cuentas hasta la Fase 4.
 */
export function AccountsStrip(): React.JSX.Element {
  const open = useAssistantUi((s) => s.open)
  const toggle = useAssistantUi((s) => s.toggle)
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
