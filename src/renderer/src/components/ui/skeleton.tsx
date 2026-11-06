import * as React from 'react'
import { cn } from '@renderer/lib/utils'

/** Bloque de carga. Respeta reducir movimiento (la animación se anula vía tokens.css). */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-surface-3', className)}
      {...props}
    />
  )
}
