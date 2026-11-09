import * as React from 'react'
import { Camera, PencilLine, RefreshCw, Trash2 } from 'lucide-react'
import {
  EMPTY_PROFILE_DATA,
  SNAPSHOT_SOURCE_LABELS,
  autoSourceFor,
  type Profile,
  type ProfileData,
  type Snapshot
} from '@shared/domain/analysis'
import { Button } from '@renderer/components/ui/button'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { fmtDateTime } from '@renderer/lib/dates'
import { cn } from '@renderer/lib/utils'
import { useAiStatus } from '@renderer/features/ai/useAi'
import { SnapshotEditor } from './SnapshotEditor'
import { SnapshotView } from './SnapshotView'
import { fmtCount, fmtUsd } from './draft'
import {
  useDeleteSnapshot,
  usePickScreenshots,
  useReadScreenshots,
  useRefreshAuto,
  useSaveSnapshot,
  useSnapshots,
  useSources
} from './useAnalysis'

type EditorState = {
  source: 'screenshots' | 'manual'
  data: ProfileData
  costUsd: number | null
} | null

/** Pestaña «Datos»: de dónde salen las cifras de la cuenta y cuáles hay guardadas. */
export function DataPanel({ profile }: { profile: Profile }): React.JSX.Element {
  const snapshots = useSnapshots(profile.id)
  const sources = useSources()
  const aiStatus = useAiStatus()
  const pick = usePickScreenshots()
  const read = useReadScreenshots()
  const save = useSaveSnapshot()
  const refresh = useRefreshAuto()
  const remove = useDeleteSnapshot()
  const [editor, setEditor] = React.useState<EditorState>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [toDelete, setToDelete] = React.useState<Snapshot | null>(null)
  const [reading, setReading] = React.useState(0)

  const list = snapshots.data ?? []
  const selected = list.find((s) => s.id === selectedId) ?? list[0] ?? null
  const auto = autoSourceFor(profile)
  const autoBlocked = auto === 'youtube' && sources.data?.youtubeApiKey === false
  const hasKey = aiStatus.data?.hasKey ?? false
  const error = pick.error ?? read.error ?? refresh.error

  const readScreenshots = async (): Promise<void> => {
    try {
      const paths = await pick.mutateAsync(undefined)
      if (paths.length === 0) return
      setReading(paths.length)
      const result = await read.mutateAsync({ profileId: profile.id, paths })
      setEditor({ source: 'screenshots', data: result.data, costUsd: result.costUsd })
    } catch {
      // El error queda en la mutación y se muestra debajo de los botones.
    } finally {
      setReading(0)
    }
  }

  const hints: string[] = []
  if (!hasKey) {
    hints.push(
      'Para leer capturas hace falta la clave de Claude (Ajustes → Claude). Mientras tanto puedes escribir los datos a mano.'
    )
  } else {
    hints.push(
      'Haz capturas del perfil y de las estadísticas (hasta 10 por lectura). Claude lee las cifras y te las enseña para que las revises antes de guardarlas. Cada lectura cuesta unos céntimos.'
    )
  }
  if (autoBlocked) {
    hints.push(
      'Para traer los datos de YouTube añade una clave de API gratuita en Ajustes → Datos automáticos.'
    )
  }
  if (profile.network === 'instagram' && !auto && profile.isOwn) {
    hints.push(
      'Si conectas tu Instagram en Cuentas y lo vinculas al editar esta ficha, sus métricas llegarán solas.'
    )
  }
  if (profile.network === 'x') hints.push('X cobra por leer datos, así que va con capturas.')

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void readScreenshots()}
            disabled={!hasKey || reading > 0 || pick.isPending}
          >
            <Camera aria-hidden />
            {reading > 0
              ? `Claude está leyendo ${reading} captura${reading === 1 ? '' : 's'}…`
              : 'Leer capturas con Claude'}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setEditor({
                source: 'manual',
                data: selected?.data ?? EMPTY_PROFILE_DATA,
                costUsd: null
              })
            }
          >
            <PencilLine aria-hidden /> Escribir a mano
          </Button>
          {auto && (
            <Button
              variant="outline"
              onClick={() =>
                refresh.mutate(
                  { profileId: profile.id },
                  { onSuccess: (snapshot) => setSelectedId(snapshot.id) }
                )
              }
              disabled={refresh.isPending || autoBlocked}
            >
              <RefreshCw aria-hidden className={refresh.isPending ? 'animate-spin' : ''} />
              {auto === 'youtube' ? 'Traer datos públicos de YouTube' : 'Traer datos de Instagram'}
            </Button>
          )}
        </div>
        <ul className="flex flex-col gap-1 text-xs text-muted">
          {hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        )}
      </section>

      {snapshots.isPending ? (
        <Skeleton className="h-48" />
      ) : !selected ? (
        <p className="rounded-lg border border-dashed border-border-strong px-4 py-10 text-center text-sm text-muted">
          Aún no hay datos de esta cuenta. Empieza leyendo unas capturas o escribiéndolos a mano.
        </p>
      ) : (
        <section className="flex flex-col gap-3">
          {list.length > 1 && (
            <div className="flex flex-wrap items-center gap-2" aria-label="Lecturas guardadas">
              <span className="text-xs text-muted">Lecturas:</span>
              {list.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={s.id === selected.id}
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-base',
                    s.id === selected.id
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-border text-muted hover:text-text'
                  )}
                >
                  {fmtDateTime(s.capturedAt)} · {SNAPSHOT_SOURCE_LABELS[s.source]} ·{' '}
                  {fmtCount(s.data.followers)} seguidores
                </button>
              ))}
            </div>
          )}
          <SnapshotView snapshot={selected} />
          <div>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              onClick={() => setToDelete(selected)}
            >
              <Trash2 aria-hidden /> Borrar esta lectura
            </Button>
          </div>
        </section>
      )}

      <SnapshotEditor
        open={editor !== null}
        onOpenChange={(open) => !open && setEditor(null)}
        title={
          editor?.source === 'screenshots' ? 'Revisa lo que ha leído Claude' : 'Datos de la cuenta'
        }
        description={
          editor?.source === 'screenshots'
            ? `Compara las cifras con tus capturas y corrige lo que haga falta antes de guardar.${
                editor.costUsd !== null ? ` Esta lectura ha costado ${fmtUsd(editor.costUsd)}.` : ''
              }`
            : 'Escribe las cifras que veas en la app de la red y deja en blanco lo que no sepas. Se guarda como una lectura nueva.'
        }
        initial={editor?.data ?? EMPTY_PROFILE_DATA}
        saving={save.isPending}
        error={save.error?.message ?? null}
        onSave={(data) =>
          editor &&
          save.mutate(
            { profileId: profile.id, source: editor.source, data },
            {
              onSuccess: (snapshot) => {
                setEditor(null)
                setSelectedId(snapshot.id)
              }
            }
          )
        }
      />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="¿Borrar esta lectura?"
        description="Se quitan estas cifras de la cuenta. Los análisis ya hechos se conservan."
        confirmLabel="Borrar"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          toDelete &&
          remove.mutate(
            { id: toDelete.id },
            {
              onSuccess: () => {
                setToDelete(null)
                setSelectedId(null)
              }
            }
          )
        }
      />
    </div>
  )
}
