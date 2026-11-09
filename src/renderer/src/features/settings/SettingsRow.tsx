import * as React from 'react'

/** Fila de ajuste: nombre y ayuda a la izquierda, control a la derecha. */
export function Row({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 py-3 not-last:border-b not-last:border-border">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted break-words">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
