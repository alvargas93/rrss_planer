import type { Pillar } from '@shared/domain/pillars'
import { ColorDot } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'

export function PillarBadge({
  pillar,
  className
}: {
  pillar: Pillar | undefined
  className?: string
}): React.JSX.Element | null {
  if (!pillar) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted',
        className
      )}
    >
      <ColorDot color={pillar.color} />
      {pillar.name}
    </span>
  )
}
