import * as React from 'react'
import { useNavigate } from 'react-router'
import {
  ArrowDown,
  ArrowUp,
  Clapperboard,
  Download,
  FilePlus2,
  Loader2,
  Mic,
  Plus,
  Sparkles,
  SquarePen,
  Trash2,
  X
} from 'lucide-react'
import type { MediaAsset } from '@shared/domain/media'
import {
  FIT_LABELS,
  FORMAT_SIZE,
  VIDEO_FORMATS,
  clipDuration,
  fmtSeconds,
  type Clip,
  type Cue,
  type Fit,
  type Timeline,
  type VideoFormat,
  type VideoProject
} from '@shared/domain/video'
import { ActionResultSchemas } from '@shared/domain/ai'
import { PageHeader } from '@renderer/components/PageHeader'
import { EmptyState } from '@renderer/components/EmptyState'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { Button } from '@renderer/components/ui/button'
import { Field, Input, Textarea } from '@renderer/components/ui/input'
import { Segmented } from '@renderer/components/ui/segmented'
import { Switch } from '@renderer/components/ui/switch'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'
import { fmtRelative } from '@renderer/lib/dates'
import { invoke } from '@renderer/lib/ipc'
import { MediaPicker } from '@renderer/features/media/MediaPicker'
import { MediaThumb } from '@renderer/features/media/MediaThumb'
import { useMediaLibrary } from '@renderer/features/media/useMedia'
import { useScreenContext } from '@renderer/features/ai/useScreenContext'
import { useComposerBridge, useScreenContextStore } from '@renderer/features/ai/stores'
import { useRunAction } from '@renderer/features/ai/useAi'
import { splitScriptIntoCuesClient } from './cues'
import {
  useCreateProject,
  useDeleteProject,
  useExportProgress,
  useExportProject,
  useTranscribeVideo,
  useUpdateProject,
  useVideoProjects
} from './useVideo'

function useDebouncedSave(project: VideoProject | undefined): {
  timeline: Timeline
  setTimeline: (next: Timeline | ((t: Timeline) => Timeline)) => void
  saving: boolean
} {
  const update = useUpdateProject()
  const [timeline, setTimelineState] = React.useState<Timeline>(
    project?.timeline ?? {
      clips: [],
      cues: [],
      subtitleStyle: { fontSize: 56, position: 'bottom', box: true }
    }
  )
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const setTimeline = React.useCallback(
    (next: Timeline | ((t: Timeline) => Timeline)) => {
      setTimelineState((current) => {
        const value = typeof next === 'function' ? next(current) : next
        if (project) {
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(
            () => update.mutate({ id: project.id, patch: { timeline: value } }),
            500
          )
        }
        return value
      })
    },
    [project, update]
  )
  return { timeline, setTimeline, saving: update.isPending }
}

function ClipRow({
  clip,
  asset,
  index,
  count,
  onChange,
  onMove,
  onRemove,
  onPreview
}: {
  clip: Clip
  asset: MediaAsset | undefined
  index: number
  count: number
  onChange: (clip: Clip) => void
  onMove: (delta: number) => void
  onRemove: () => void
  onPreview: () => void
}): React.JSX.Element {
  const mediaSec = asset?.durationMs ? asset.durationMs / 1000 : null
  const dur = mediaSec !== null ? clipDuration(clip, mediaSec) : null
  return (
    <li className="flex items-center gap-3 rounded-md border border-border p-2">
      <button
        type="button"
        onClick={onPreview}
        className="size-14 shrink-0 overflow-hidden rounded-sm bg-surface-2"
        aria-label="Previsualizar clip"
      >
        {asset ? <MediaThumb asset={asset} /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {asset?.originalName ?? 'Archivo no disponible'}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1 text-muted">
            Desde
            <Input
              type="number"
              min={0}
              step={0.1}
              className="h-7 w-20 text-xs"
              value={clip.startSec}
              onChange={(e) =>
                onChange({ ...clip, startSec: Math.max(0, Number(e.target.value) || 0) })
              }
              aria-label="Inicio en segundos"
            />
          </label>
          <label className="flex items-center gap-1 text-muted">
            hasta
            <Input
              type="number"
              min={0}
              step={0.1}
              className="h-7 w-20 text-xs"
              value={clip.endSec ?? ''}
              placeholder={mediaSec !== null ? mediaSec.toFixed(1) : 'fin'}
              onChange={(e) =>
                onChange({
                  ...clip,
                  endSec: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0)
                })
              }
              aria-label="Fin en segundos"
            />
          </label>
          <span className="text-subtle">
            {dur !== null ? `→ ${fmtSeconds(dur)}` : 'duración desconocida'}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-0.5">
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Subir"
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Bajar"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown aria-hidden />
        </Button>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        aria-label="Quitar clip"
        onClick={onRemove}
      >
        <X aria-hidden />
      </Button>
    </li>
  )
}

function Editor({
  project,
  library
}: {
  project: VideoProject
  library: MediaAsset[]
}): React.JSX.Element {
  const navigate = useNavigate()
  const update = useUpdateProject()
  const exportProject = useExportProject()
  const progress = useExportProgress(project.id)
  const runCaptions = useRunAction()
  const transcribe = useTranscribeVideo()
  const pushToComposer = useComposerBridge((s) => s.push)
  const context = useScreenContextStore((s) => s.context)
  const { timeline, setTimeline, saving } = useDebouncedSave(project)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [previewId, setPreviewId] = React.useState<string | null>(null)
  const [script, setScript] = React.useState('')
  const videoRef = React.useRef<HTMLVideoElement>(null)

  const assets = new Map(library.map((a) => [a.id, a]))
  const totalSec = timeline.clips.reduce((t, c) => {
    const a = assets.get(c.mediaId)
    return t + (a?.durationMs ? clipDuration(c, a.durationMs / 1000) : 0)
  }, 0)
  const size = FORMAT_SIZE[project.format]
  const preview = previewId ? assets.get(previewId) : assets.get(timeline.clips[0]?.mediaId ?? '')
  const exported = project.lastExportMediaId ? assets.get(project.lastExportMediaId) : undefined
  const exporting = exportProject.isPending || (progress !== null && !progress.done)

  useScreenContext({
    screen: 'video',
    extra: `Proyecto de vídeo «${project.name}», formato ${project.format}, duración total ${totalSec.toFixed(1)} s.${script ? `\nGuion:\n${script}` : ''}`
  })

  const setClip = (i: number, clip: Clip): void =>
    setTimeline((t) => ({ ...t, clips: t.clips.map((c, j) => (j === i ? clip : c)) }))
  const moveClip = (i: number, delta: number): void =>
    setTimeline((t) => {
      const clips = [...t.clips]
      const j = i + delta
      if (j < 0 || j >= clips.length) return t
      ;[clips[i], clips[j]] = [clips[j]!, clips[i]!]
      return { ...t, clips }
    })
  const setCue = (i: number, cue: Cue): void =>
    setTimeline((t) => ({ ...t, cues: t.cues.map((c, j) => (j === i ? cue : c)) }))

  const generateCaptions = (): void => {
    if (!script.trim() || totalSec <= 0) return
    runCaptions.mutate(
      {
        conversationId: null,
        kind: 'captions',
        instruction: '',
        networks: [],
        context: {
          ...context,
          extra: `Guion:\n${script}\n\nDuración total del vídeo: ${totalSec.toFixed(1)} segundos.`
        }
      },
      {
        onSuccess: (message) => {
          const block = message.blocks.find((b) => b.type === 'action')
          const parsed =
            block && block.type === 'action'
              ? ActionResultSchemas.captions.safeParse(block.result)
              : null
          if (parsed?.success)
            setTimeline((t) => ({
              ...t,
              cues: parsed.data.cues.map((c) => ({
                start: Number(c.start.toFixed(2)),
                end: Number(Math.min(totalSec, c.end).toFixed(2)),
                text: c.text.slice(0, 200)
              }))
            }))
        }
      }
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <Field label="Nombre" htmlFor="vp-name">
              <Input
                id="vp-name"
                defaultValue={project.name}
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value !== project.name &&
                  update.mutate({ id: project.id, patch: { name: e.target.value.trim() } })
                }
              />
            </Field>
            <span className="pb-2 text-xs text-subtle">
              {saving ? 'Guardando…' : `Guardado ${fmtRelative(project.updatedAt)}`}
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Formato de salida">
              <Segmented
                aria-label="Formato de salida"
                value={project.format}
                onChange={(format) =>
                  update.mutate({ id: project.id, patch: { format: format as VideoFormat } })
                }
                options={VIDEO_FORMATS.map((f) => ({ value: f, label: f }))}
              />
            </Field>
            <Field label="Si el clip no encaja" htmlFor="vp-fit">
              <Select
                value={project.fit}
                onValueChange={(fit) =>
                  update.mutate({ id: project.id, patch: { fit: fit as Fit } })
                }
              >
                <SelectTrigger id="vp-fit" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIT_LABELS) as Fit[]).map((f) => (
                    <SelectItem key={f} value={f}>
                      {FIT_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <p className="pb-2 text-xs text-muted">
              {size.width}×{size.height} · {size.label}
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Clips</p>
              <p className="text-xs text-muted">
                Se unen en este orden. Recorta cada uno con «desde» y «hasta» en segundos. Total:{' '}
                {fmtSeconds(totalSec)}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              <Plus aria-hidden /> Añadir clip
            </Button>
          </div>
          {timeline.clips.length === 0 ? (
            <p className="rounded-md border border-dashed border-border-strong p-6 text-center text-sm text-muted">
              Añade uno o varios vídeos de la biblioteca.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {timeline.clips.map((clip, i) => (
                <ClipRow
                  key={`${clip.mediaId}-${i}`}
                  clip={clip}
                  asset={assets.get(clip.mediaId)}
                  index={i}
                  count={timeline.clips.length}
                  onChange={(c) => setClip(i, c)}
                  onMove={(d) => moveClip(i, d)}
                  onRemove={() =>
                    setTimeline((t) => ({ ...t, clips: t.clips.filter((_, j) => j !== i) }))
                  }
                  onPreview={() => setPreviewId(clip.mediaId)}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Subtítulos</p>
              <p className="text-xs text-muted">
                Se graban en el vídeo (quemados). Tiempos en segundos desde el inicio del vídeo
                final.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setTimeline((t) => ({
                  ...t,
                  cues: [
                    ...t.cues,
                    {
                      start: t.cues.at(-1)?.end ?? 0,
                      end: Math.min(totalSec || 3, (t.cues.at(-1)?.end ?? 0) + 3),
                      text: ''
                    }
                  ]
                }))
              }
            >
              <Plus aria-hidden /> Añadir línea
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Textarea
              rows={3}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Pega aquí el guion y genera los subtítulos automáticamente…"
              aria-label="Guion para subtítulos"
            />
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                onClick={generateCaptions}
                disabled={!script.trim() || totalSec <= 0 || runCaptions.isPending}
              >
                {runCaptions.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Sparkles aria-hidden />
                )}{' '}
                Generar con Claude
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setTimeline((t) => ({ ...t, cues: splitScriptIntoCuesClient(script, totalSec) }))
                }
                disabled={!script.trim() || totalSec <= 0}
              >
                Repartir sin IA
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  transcribe.mutate(
                    { id: project.id },
                    { onSuccess: (cues) => setTimeline((t) => ({ ...t, cues })) }
                  )
                }
                disabled={timeline.clips.length === 0 || transcribe.isPending}
              >
                {transcribe.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Mic aria-hidden />
                )}
                {transcribe.isPending ? 'Transcribiendo…' : 'Transcribir audio (local)'}
              </Button>
              {transcribe.error && (
                <p role="alert" className="max-w-xs text-xs text-danger">
                  {transcribe.error.message}
                </p>
              )}
            </div>
          </div>
          {runCaptions.error && (
            <p role="alert" className="text-sm text-danger">
              {runCaptions.error.message}
            </p>
          )}
          {timeline.cues.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {timeline.cues.map((cue, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    className="h-8 w-20 text-xs"
                    value={cue.start}
                    onChange={(e) => setCue(i, { ...cue, start: Number(e.target.value) || 0 })}
                    aria-label={`Inicio del subtítulo ${i + 1}`}
                  />
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    className="h-8 w-20 text-xs"
                    value={cue.end}
                    onChange={(e) => setCue(i, { ...cue, end: Number(e.target.value) || 0 })}
                    aria-label={`Fin del subtítulo ${i + 1}`}
                  />
                  <Input
                    className="h-8 flex-1 text-sm"
                    value={cue.text}
                    maxLength={200}
                    onChange={(e) => setCue(i, { ...cue, text: e.target.value })}
                    aria-label={`Texto del subtítulo ${i + 1}`}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label="Quitar subtítulo"
                    onClick={() =>
                      setTimeline((t) => ({ ...t, cues: t.cues.filter((_, j) => j !== i) }))
                    }
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              Tamaño
              <Input
                type="number"
                min={24}
                max={120}
                className="h-8 w-20 text-xs"
                value={timeline.subtitleStyle.fontSize}
                onChange={(e) =>
                  setTimeline((t) => ({
                    ...t,
                    subtitleStyle: {
                      ...t.subtitleStyle,
                      fontSize: Math.min(120, Math.max(24, Number(e.target.value) || 56))
                    }
                  }))
                }
                aria-label="Tamaño de letra"
              />
            </label>
            <Segmented
              aria-label="Posición de los subtítulos"
              value={timeline.subtitleStyle.position}
              onChange={(position) =>
                setTimeline((t) => ({ ...t, subtitleStyle: { ...t.subtitleStyle, position } }))
              }
              options={[
                { value: 'bottom', label: 'Abajo' },
                { value: 'center', label: 'Centro' },
                { value: 'top', label: 'Arriba' }
              ]}
            />
            <label className="flex items-center gap-2">
              <Switch
                aria-label="Caja de fondo"
                checked={timeline.subtitleStyle.box}
                onCheckedChange={(box) =>
                  setTimeline((t) => ({ ...t, subtitleStyle: { ...t.subtitleStyle, box } }))
                }
              />{' '}
              Caja de fondo
            </label>
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
          <p className="mb-2 text-sm font-medium">Vista previa del encuadre</p>
          <div
            className="mx-auto overflow-hidden rounded-md bg-black"
            style={{ aspectRatio: `${size.width} / ${size.height}`, maxHeight: 420 }}
          >
            {preview ? (
              <video
                ref={videoRef}
                key={preview.id}
                src={preview.url}
                controls
                muted
                className={cn(
                  'size-full',
                  project.fit === 'crop' ? 'object-cover' : 'object-contain'
                )}
                aria-label={preview.originalName}
              />
            ) : (
              <div className="grid size-full place-items-center text-xs text-white/60">
                Sin clips
              </div>
            )}
          </div>
          {timeline.cues[0] && (
            <p
              className={cn(
                'mt-2 rounded-sm px-2 py-1 text-center text-xs text-white',
                timeline.subtitleStyle.box ? 'bg-black/70' : 'bg-black/30'
              )}
            >
              {timeline.cues[0].text || 'Subtítulo de ejemplo'}
            </p>
          )}
          <p className="mt-2 text-[11px] text-subtle">
            La vista previa muestra el clip original; el recorte y los subtítulos se aplican al
            exportar.
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-sm">
          <Button
            onClick={() => exportProject.mutate({ id: project.id })}
            disabled={timeline.clips.length === 0 || exporting}
          >
            {exporting ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Download aria-hidden />
            )}{' '}
            {exporting ? 'Exportando…' : 'Exportar MP4'}
          </Button>
          {progress && !progress.done && (
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
              role="progressbar"
              aria-valuenow={progress.percent ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progreso de exportación"
            >
              <div
                className="h-full rounded-full bg-accent-gradient transition-[width]"
                style={{ width: `${progress.percent ?? 0}%` }}
              />
            </div>
          )}
          {progress && (
            <p className={cn('text-xs', progress.error ? 'text-danger' : 'text-muted')}>
              {progress.error ?? progress.message}
            </p>
          )}
          {exportProject.error && !progress?.error && (
            <p role="alert" className="text-xs text-danger">
              {exportProject.error.message}
            </p>
          )}
          {exported && (
            <div className="mt-1 flex items-center gap-2 rounded-md border border-border p-2">
              <div className="size-12 shrink-0 overflow-hidden rounded-sm bg-surface-2">
                <MediaThumb asset={exported} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{exported.originalName}</p>
                <p className="text-[11px] text-subtle">
                  {exported.durationMs ? fmtSeconds(exported.durationMs / 1000) : ''} ·{' '}
                  {(exported.sizeBytes / 1048576).toFixed(1)} MB
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  pushToComposer({ kind: 'media', asset: exported })
                  void navigate('/compose')
                }}
              >
                <SquarePen aria-hidden /> Usar en publicación
              </Button>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={() => void invoke('app:openDataFolder')}>
            Abrir carpeta de medios
          </Button>
        </div>
      </aside>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedIds={[]}
        onConfirm={(assetsPicked) =>
          setTimeline((t) => ({
            ...t,
            clips: [
              ...t.clips,
              ...assetsPicked
                .filter((a) => a.kind === 'video')
                .map((a) => ({ mediaId: a.id, startSec: 0, endSec: null }))
            ]
          }))
        }
        maxSelectable={10}
      />
    </div>
  )
}

export function VideoPage(): React.JSX.Element {
  const projects = useVideoProjects()
  const library = useMediaLibrary()
  const create = useCreateProject()
  const remove = useDeleteProject()
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [toDelete, setToDelete] = React.useState<VideoProject | null>(null)
  const list = projects.data ?? []
  const selected = list.find((p) => p.id === selectedId) ?? list[0]

  return (
    <>
      <PageHeader
        title="Vídeo"
        description="Recorta, une, añade subtítulos y exporta en vertical, cuadrado u horizontal. Todo en tu equipo, con FFmpeg."
        actions={
          <Button
            onClick={() => create.mutate({}, { onSuccess: (p) => setSelectedId(p.id) })}
            disabled={create.isPending}
          >
            <FilePlus2 aria-hidden /> Nuevo proyecto
          </Button>
        }
      />
      {projects.isPending || library.isPending ? (
        <Skeleton className="h-96" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title="Sin proyectos de vídeo"
          description="Crea un proyecto, añade clips de la biblioteca y exporta un MP4 listo para reels, shorts o YouTube."
          action={
            <Button onClick={() => create.mutate({}, { onSuccess: (p) => setSelectedId(p.id) })}>
              <FilePlus2 aria-hidden /> Nuevo proyecto
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {list.map((p) => (
              <div key={p.id} className="group flex items-center">
                <button
                  type="button"
                  aria-pressed={selected?.id === p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    'rounded-full px-3 py-1 text-sm font-medium transition-base',
                    selected?.id === p.id
                      ? 'bg-text text-bg'
                      : 'bg-surface-2 text-muted hover:text-text'
                  )}
                >
                  {p.name}
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Eliminar proyecto ${p.name}`}
                  onClick={() => setToDelete(p)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
          </div>
          {selected && <Editor key={selected.id} project={selected} library={library.data ?? []} />}
        </div>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`¿Eliminar «${toDelete?.name}»?`}
        description="Los vídeos exportados siguen en la biblioteca."
        confirmLabel="Eliminar"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          toDelete && remove.mutate({ id: toDelete.id }, { onSuccess: () => setToDelete(null) })
        }
      />
    </>
  )
}
