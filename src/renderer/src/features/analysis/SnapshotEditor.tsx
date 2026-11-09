import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { ProfileData } from '@shared/domain/analysis'
import { Button } from '@renderer/components/ui/button'
import { Field, Input, Textarea } from '@renderer/components/ui/input'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  POST_NUMBER_FIELDS,
  emptyMetric,
  emptyPost,
  fromDraft,
  isInvalidNumber,
  toDraft,
  type ProfileDraft
} from './draft'

interface SnapshotEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  initial: ProfileData
  saving: boolean
  error: string | null
  onSave: (data: ProfileData) => void
}

/**
 * Revisión y edición de los datos de una cuenta. Se usa para comprobar lo que Claude leyó de
 * las capturas antes de guardarlo y para escribir los datos a mano.
 */
export function SnapshotEditor(props: SnapshotEditorProps): React.JSX.Element {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-5xl">
        {/* El contenido se monta al abrir, así el borrador parte siempre de `initial`. */}
        <SnapshotEditorForm {...props} />
      </DialogContent>
    </Dialog>
  )
}

function SnapshotEditorForm({
  onOpenChange,
  title,
  description,
  initial,
  saving,
  error,
  onSave
}: SnapshotEditorProps): React.JSX.Element {
  const [draft, setDraft] = React.useState<ProfileDraft>(() => toDraft(initial))
  const [invalid, setInvalid] = React.useState(false)

  const patch = (changes: Partial<ProfileDraft>): void => {
    // El aviso de cifras no válidas desaparece en cuanto se corrige algo.
    setInvalid(false)
    setDraft((d) => ({ ...d, ...changes }))
  }

  const save = (): void => {
    const data = fromDraft(draft)
    if (!data) {
      setInvalid(true)
      return
    }
    onSave(data)
  }

  const numberInput = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void
  ): React.JSX.Element => (
    <Field label={label} htmlFor={id}>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        aria-invalid={isInvalidNumber(value) || undefined}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
      />
    </Field>
  )

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-6">
        <section className="grid gap-4 sm:grid-cols-3">
          {numberInput('snap-followers', 'Seguidores', draft.followers, (followers) =>
            patch({ followers })
          )}
          {numberInput('snap-following', 'Siguiendo', draft.following, (following) =>
            patch({ following })
          )}
          {numberInput('snap-posts', 'Publicaciones totales', draft.postsCount, (postsCount) =>
            patch({ postsCount })
          )}
          <Field label="Nombre visible" htmlFor="snap-name">
            <Input
              id="snap-name"
              value={draft.displayName}
              onChange={(e) => patch({ displayName: e.target.value })}
            />
          </Field>
          <Field
            label="Periodo de las estadísticas"
            htmlFor="snap-period"
            className="sm:col-span-2"
          >
            <Input
              id="snap-period"
              value={draft.period}
              placeholder="Por ejemplo: últimos 30 días"
              onChange={(e) => patch({ period: e.target.value })}
            />
          </Field>
          <Field label="Biografía" htmlFor="snap-bio" className="sm:col-span-3">
            <Textarea
              id="snap-bio"
              rows={2}
              className="min-h-14"
              value={draft.bio}
              onChange={(e) => patch({ bio: e.target.value })}
            />
          </Field>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Estadísticas de la cuenta</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => patch({ metrics: [...draft.metrics, emptyMetric()] })}
            >
              <Plus aria-hidden /> Añadir estadística
            </Button>
          </div>
          {draft.metrics.length === 0 ? (
            <p className="text-sm text-muted">
              Alcance, visualizaciones, interacciones… lo que muestre la red.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {draft.metrics.map((m, i) => (
                <li key={m.key} className="grid grid-cols-[1.4fr_0.8fr_1.4fr_auto] gap-2">
                  <Input
                    aria-label={`Nombre de la estadística ${i + 1}`}
                    value={m.label}
                    placeholder="Alcance"
                    onChange={(e) =>
                      patch({
                        metrics: draft.metrics.map((x) =>
                          x.key === m.key ? { ...x, label: e.target.value } : x
                        )
                      })
                    }
                  />
                  <Input
                    aria-label={`Cifra de la estadística ${i + 1}`}
                    inputMode="decimal"
                    value={m.value}
                    aria-invalid={isInvalidNumber(m.value) || undefined}
                    onChange={(e) =>
                      patch({
                        metrics: draft.metrics.map((x) =>
                          x.key === m.key ? { ...x, value: e.target.value } : x
                        )
                      })
                    }
                  />
                  <Input
                    aria-label={`Nota de la estadística ${i + 1}`}
                    value={m.note}
                    placeholder="+12 % frente al mes anterior"
                    onChange={(e) =>
                      patch({
                        metrics: draft.metrics.map((x) =>
                          x.key === m.key ? { ...x, note: e.target.value } : x
                        )
                      })
                    }
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Quitar la estadística ${i + 1}`}
                    onClick={() => patch({ metrics: draft.metrics.filter((x) => x.key !== m.key) })}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Publicaciones</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => patch({ posts: [...draft.posts, emptyPost()] })}
            >
              <Plus aria-hidden /> Añadir publicación
            </Button>
          </div>
          {draft.posts.length === 0 ? (
            <p className="text-sm text-muted">
              Añade las publicaciones que quieras analizar con sus cifras.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[860px] text-xs">
                <thead className="bg-surface-2 text-left text-muted">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Formato</th>
                    <th className="px-2 py-1.5 font-medium">Fecha</th>
                    <th className="px-2 py-1.5 font-medium">Texto</th>
                    {POST_NUMBER_FIELDS.map((f) => (
                      <th key={f.key} className="px-2 py-1.5 font-medium">
                        {f.label}
                      </th>
                    ))}
                    <th className="sr-only">Quitar</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.posts.map((p, i) => {
                    const set = (changes: Partial<typeof p>): void =>
                      patch({
                        posts: draft.posts.map((x) => (x.key === p.key ? { ...x, ...changes } : x))
                      })
                    return (
                      <tr key={p.key} className="border-t border-border">
                        <td className="p-1">
                          <Input
                            className="h-8 w-24 text-xs"
                            aria-label={`Formato de la publicación ${i + 1}`}
                            value={p.format}
                            placeholder="reel"
                            onChange={(e) => set({ format: e.target.value })}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            className="h-8 w-24 text-xs"
                            aria-label={`Fecha de la publicación ${i + 1}`}
                            value={p.publishedAt}
                            placeholder="2026-11-01"
                            onChange={(e) => set({ publishedAt: e.target.value })}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            className="h-8 min-w-48 text-xs"
                            aria-label={`Texto de la publicación ${i + 1}`}
                            value={p.caption}
                            onChange={(e) => set({ caption: e.target.value })}
                          />
                        </td>
                        {POST_NUMBER_FIELDS.map((f) => (
                          <td key={f.key} className="p-1">
                            <Input
                              className="h-8 w-20 text-xs"
                              inputMode="decimal"
                              aria-label={`${f.label} de la publicación ${i + 1}`}
                              value={p[f.key]}
                              aria-invalid={isInvalidNumber(p[f.key]) || undefined}
                              onChange={(e) => set({ [f.key]: e.target.value })}
                            />
                          </td>
                        ))}
                        <td className="p-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Quitar la publicación ${i + 1}`}
                            onClick={() =>
                              patch({ posts: draft.posts.filter((x) => x.key !== p.key) })
                            }
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <Field
          label="Observaciones"
          htmlFor="snap-notes"
          hint="Lo que no encaja arriba o lo que conviene tener en cuenta."
        >
          <Textarea
            id="snap-notes"
            rows={2}
            className="min-h-14"
            value={draft.observations}
            onChange={(e) => patch({ observations: e.target.value })}
          />
        </Field>
      </DialogBody>
      <DialogFooter className="justify-between">
        <p role="alert" className="text-sm text-danger">
          {invalid
            ? 'Hay cifras que no son números. Corrige las casillas marcadas en rojo.'
            : (error ?? '')}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            Guardar datos
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
