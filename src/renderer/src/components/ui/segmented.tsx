import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
}

interface SegmentedProps<T extends string> {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  'aria-label': string
  className?: string
}

/**
 * Control segmentado accesible (patrón radiogroup): flechas para moverse,
 * espacio/intro para seleccionar.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  ...aria
}: SegmentedProps<T>): React.JSX.Element {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (event: React.KeyboardEvent, index: number): void => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (!delta) return
    event.preventDefault()
    const next = (index + delta + options.length) % options.length
    const option = options[next]
    if (option) {
      onChange(option.value)
      refs.current[next]?.focus()
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={aria['aria-label']}
      className={cn('inline-flex rounded-md border border-border bg-surface-2 p-0.5', className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-sm font-medium transition-base',
              selected ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'
            )}
          >
            {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
