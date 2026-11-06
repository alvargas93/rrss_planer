import { ColorDot } from '@renderer/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { usePillars } from './usePillars'

const NONE = '__none__'

/** Selector de pilar con opción "sin pilar". */
export function PillarSelect({
  value,
  onChange,
  id,
  className
}: {
  value: string | null
  onChange: (pillarId: string | null) => void
  id?: string
  className?: string
}): React.JSX.Element {
  const { data: pillars = [] } = usePillars()
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger id={id} className={className} aria-label="Pilar de contenido">
        <SelectValue placeholder="Sin pilar" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Sin pilar</SelectItem>
        {pillars.map((pillar) => (
          <SelectItem key={pillar.id} value={pillar.id}>
            <span className="inline-flex items-center gap-2">
              <ColorDot color={pillar.color} />
              {pillar.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
