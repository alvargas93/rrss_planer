import * as React from 'react'
import {
  IDEA_STATUSES,
  IDEA_STATUS_LABELS,
  type Idea,
  type IdeaCreate,
  type IdeaStatus
} from '@shared/domain/ideas'
import { Button } from '@renderer/components/ui/button'
import { Field, Input, Textarea } from '@renderer/components/ui/input'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { PillarSelect } from '@renderer/features/pillars/PillarSelect'
import { useCreateIdea, useUpdateIdea } from './useIdeas'

interface IdeaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Si se pasa, el diálogo edita; si no, crea. */
  idea?: Idea
}

const empty: IdeaCreate = {
  title: '',
  notes: '',
  pillarId: null,
  status: 'inbox',
  source: '',
  tags: []
}

function initialForm(idea?: Idea): IdeaCreate {
  return idea
    ? {
        title: idea.title,
        notes: idea.notes,
        pillarId: idea.pillarId,
        status: idea.status,
        source: idea.source,
        tags: idea.tags
      }
    : empty
}

/**
 * El formulario se monta cada vez que se abre el diálogo (Radix desmonta el
 * contenido al cerrar), así que el estado inicial se toma de las props sin efectos.
 */
function IdeaForm({ idea, onClose }: { idea?: Idea; onClose: () => void }): React.JSX.Element {
  const create = useCreateIdea()
  const update = useUpdateIdea()
  const [form, setForm] = React.useState<IdeaCreate>(() => initialForm(idea))
  const [tagsText, setTagsText] = React.useState(() => idea?.tags.join(', ') ?? '')

  const pending = create.isPending || update.isPending
  const error = create.error ?? update.error

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const payload = { ...form, tags }
    if (idea) {
      update.mutate({ id: idea.id, patch: payload }, { onSuccess: onClose })
    } else {
      create.mutate(payload, { onSuccess: onClose })
    }
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{idea ? 'Editar idea' : 'Nueva idea'}</DialogTitle>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <Field label="Título" htmlFor="idea-title">
          <Input
            id="idea-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="¿De qué va?"
            required
            autoFocus
          />
        </Field>
        <Field
          label="Notas"
          htmlFor="idea-notes"
          hint="Gancho, ángulo, referencias… todo lo que no quieras olvidar."
        >
          <Textarea
            id="idea-notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={5}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pilar" htmlFor="idea-pillar">
            <PillarSelect
              id="idea-pillar"
              value={form.pillarId}
              onChange={(pillarId) => setForm({ ...form, pillarId })}
            />
          </Field>
          <Field label="Estado" htmlFor="idea-status">
            <Select
              value={form.status}
              onValueChange={(status) => setForm({ ...form, status: status as IdeaStatus })}
            >
              <SelectTrigger id="idea-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IDEA_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {IDEA_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fuente" htmlFor="idea-source" hint="Dónde la viste u oíste.">
            <Input
              id="idea-source"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
          </Field>
          <Field label="Etiquetas" htmlFor="idea-tags" hint="Separadas por comas.">
            <Input
              id="idea-tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="reel, tutorial"
            />
          </Field>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !form.title.trim()}>
          {idea ? 'Guardar' : 'Crear idea'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function IdeaDialog({ open, onOpenChange, idea }: IdeaDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <IdeaForm key={idea?.id ?? 'new'} idea={idea} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
