import * as React from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { PILLAR_PALETTE } from '@shared/domain/common'
import type { Pillar } from '@shared/domain/pillars'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { ColorDot } from '@renderer/components/ui/badge'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { cn } from '@renderer/lib/utils'
import { useCreatePillar, useDeletePillar, usePillars, useUpdatePillar } from './usePillars'

function ColorPicker({
  value,
  onChange
}: {
  value: string
  onChange: (color: string) => void
}): React.JSX.Element {
  return (
    <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-1.5">
      {PILLAR_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={`Color ${color}`}
          onClick={() => onChange(color)}
          className={cn(
            'grid size-6 place-items-center rounded-full transition-base',
            value === color
              ? 'ring-2 ring-text ring-offset-2 ring-offset-surface'
              : 'hover:scale-110'
          )}
          style={{ backgroundColor: color }}
        >
          {value === color && <Check size={12} className="text-white" aria-hidden />}
        </button>
      ))}
    </div>
  )
}

function PillarRow({ pillar }: { pillar: Pillar }): React.JSX.Element {
  const update = useUpdatePillar()
  const remove = useDeletePillar()
  const [editing, setEditing] = React.useState(false)
  const [name, setName] = React.useState(pillar.name)
  const [color, setColor] = React.useState(pillar.color)

  const save = (): void => {
    if (!name.trim()) return
    update.mutate(
      { id: pillar.id, patch: { name: name.trim(), color } },
      { onSuccess: () => setEditing(false) }
    )
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 rounded-md border border-border p-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nombre del pilar"
          onKeyDown={(e) => e.key === 'Enter' && save()}
          autoFocus
        />
        <ColorPicker value={color} onChange={setColor} />
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            <X aria-hidden /> Cancelar
          </Button>
          <Button size="sm" onClick={save} disabled={update.isPending || !name.trim()}>
            <Check aria-hidden /> Guardar
          </Button>
        </div>
      </li>
    )
  }

  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface-2">
      <ColorDot color={pillar.color} className="size-3" />
      <span className="flex-1 truncate text-sm font-medium">{pillar.name}</span>
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        aria-label={`Editar ${pillar.name}`}
        onClick={() => setEditing(true)}
      >
        <Pencil aria-hidden />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-8 hover:text-danger"
        aria-label={`Eliminar ${pillar.name}`}
        onClick={() => remove.mutate({ id: pillar.id })}
        disabled={remove.isPending}
      >
        <Trash2 aria-hidden />
      </Button>
    </li>
  )
}

/** Gestión de pilares de contenido: crear, renombrar, cambiar color, eliminar. */
export function PillarsDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const { data: pillars = [] } = usePillars()
  const create = useCreatePillar()
  const [name, setName] = React.useState('')
  const [color, setColor] = React.useState<string>(PILLAR_PALETTE[0])

  const add = (): void => {
    if (!name.trim()) return
    create.mutate(
      { name: name.trim(), color },
      {
        onSuccess: () => {
          setName('')
          setColor(
            PILLAR_PALETTE[(pillars.length + 1) % PILLAR_PALETTE.length] ?? PILLAR_PALETTE[0]
          )
        }
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pilares de contenido</DialogTitle>
          <DialogDescription>
            Los temas sobre los que gira tu cuenta. Sirven para clasificar ideas y publicaciones y
            para ver si estás equilibrando el calendario.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <form
            className="flex flex-col gap-2 rounded-md bg-surface-2 p-3"
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nuevo pilar, p. ej. «Detrás de cámaras»"
              aria-label="Nombre del nuevo pilar"
            />
            <div className="flex items-center justify-between gap-3">
              <ColorPicker value={color} onChange={setColor} />
              <Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>
                Añadir
              </Button>
            </div>
            {create.isError && (
              <p role="alert" className="text-xs text-danger">
                {create.error.message}
              </p>
            )}
          </form>
          {pillars.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Todavía no hay pilares.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {pillars.map((pillar) => (
                <PillarRow key={pillar.id} pillar={pillar} />
              ))}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
