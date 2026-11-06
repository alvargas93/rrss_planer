import * as React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { CalendarClock, Copy, ImagePlus, Save, Trash2, X } from 'lucide-react'
import {
  KIND_META,
  NETWORKS,
  NETWORK_META,
  type Network,
  type PostKind
} from '@shared/connectors/networks'
import type { MediaAsset } from '@shared/domain/media'
import type { Idea } from '@shared/domain/ideas'
import type { PostCreate, PostDetail, PostStatus, PostVariantInput } from '@shared/domain/posts'
import { POST_STATUS_LABELS } from '@shared/domain/posts'
import { PageHeader } from '@renderer/components/PageHeader'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Field, Input, Textarea } from '@renderer/components/ui/input'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { PillarSelect } from '@renderer/features/pillars/PillarSelect'
import { MediaPicker } from '@renderer/features/media/MediaPicker'
import { MediaThumb } from '@renderer/features/media/MediaThumb'
import { useIdeas } from '@renderer/features/ideas/useIdeas'
import { useUpdateMedia } from '@renderer/features/media/useMedia'
import { fromDateTimeLocal, toDateTimeLocal } from '@renderer/lib/dates'
import { cn } from '@renderer/lib/utils'
import { NetworkPreview } from './NetworkPreview'
import { usePillars } from '@renderer/features/pillars/usePillars'
import { useScreenContext } from '@renderer/features/ai/useScreenContext'
import { useComposerBridge, type ComposerInsert } from '@renderer/features/ai/stores'
import {
  useCreatePost,
  useDeletePost,
  usePost,
  useUpdatePost
} from '@renderer/features/posts/usePosts'

interface VariantState {
  kind: PostKind
  text: string
  extra: Record<string, string>
}

interface FormState {
  title: string
  body: string
  pillarId: string | null
  ideaId: string | null
  notes: string
  scheduledAt: string | null
  variants: Partial<Record<Network, VariantState>>
  media: MediaAsset[]
}

const emptyForm: FormState = {
  title: '',
  body: '',
  pillarId: null,
  ideaId: null,
  notes: '',
  scheduledAt: null,
  variants: {},
  media: []
}

function fromDetail(detail: PostDetail): FormState {
  const variants: FormState['variants'] = {}
  for (const v of detail.variants)
    variants[v.network] = { kind: v.kind, text: v.text, extra: v.extra }
  return {
    title: detail.post.title,
    body: detail.post.body,
    pillarId: detail.post.pillarId,
    ideaId: detail.post.ideaId,
    notes: detail.post.notes,
    scheduledAt: detail.post.scheduledAt,
    variants,
    media: detail.media
  }
}

function fromIdea(idea: Idea | undefined, scheduledAt: string | null): FormState {
  return {
    ...emptyForm,
    title: idea?.title ?? '',
    body: idea?.notes ?? '',
    pillarId: idea?.pillarId ?? null,
    ideaId: idea?.id ?? null,
    scheduledAt
  }
}

function toPayload(form: FormState): PostCreate {
  const variants: PostVariantInput[] = []
  for (const network of NETWORKS) {
    const v = form.variants[network]
    if (v) variants.push({ network, kind: v.kind, text: v.text, extra: v.extra })
  }
  return {
    title: form.title,
    body: form.body,
    pillarId: form.pillarId,
    ideaId: form.ideaId,
    notes: form.notes,
    scheduledAt: form.scheduledAt,
    variants,
    mediaIds: form.media.map((m) => m.id)
  }
}

/**
 * Página: decide qué estado inicial toca (publicación existente, idea o vacío)
 * y monta el formulario con una `key` para que arranque limpio cada vez.
 */
export function ComposerPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const detail = usePost(id)
  const ideaIdParam = params.get('ideaId')
  const dateParam = params.get('date')
  const ideas = useIdeas({ includeArchived: true }, { enabled: !!ideaIdParam })

  if (id && detail.isPending) {
    return (
      <>
        <PageHeader title="Editar publicación" />
        <Skeleton className="h-96" />
      </>
    )
  }

  if (id && (detail.isError || !detail.data)) {
    return (
      <>
        <PageHeader title="Editar publicación" />
        <p className="text-sm text-danger">
          No se encontró la publicación. {detail.error?.message ?? ''}
        </p>
      </>
    )
  }

  if (id && detail.data) {
    return (
      <ComposerForm
        key={id}
        postId={id}
        status={detail.data.post.status}
        initial={fromDetail(detail.data)}
      />
    )
  }

  if (ideaIdParam && ideas.isPending) {
    return (
      <>
        <PageHeader title="Nueva publicación" />
        <Skeleton className="h-96" />
      </>
    )
  }

  const idea = ideaIdParam ? ideas.data?.find((i) => i.id === ideaIdParam) : undefined
  return (
    <ComposerForm
      key={`new-${ideaIdParam ?? ''}-${dateParam ?? ''}`}
      postId={undefined}
      status={undefined}
      initial={fromIdea(idea, dateParam)}
    />
  )
}

function ComposerForm({
  postId,
  status,
  initial
}: {
  postId: string | undefined
  status: PostStatus | undefined
  initial: FormState
}): React.JSX.Element {
  const navigate = useNavigate()
  const create = useCreatePost()
  const update = useUpdatePost()
  const remove = useDeletePost()
  const updateMedia = useUpdateMedia()

  const [form, setForm] = React.useState<FormState>(initial)
  const [dirty, setDirty] = React.useState(false)
  const [activeNetwork, setActiveNetwork] = React.useState<Network | null>(
    () => (Object.keys(initial.variants)[0] as Network | undefined) ?? null
  )
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const { data: pillars } = usePillars()

  // El asistente ve la publicación que se está editando.
  useScreenContext({
    screen: 'composer',
    post: {
      id: postId,
      title: form.title,
      body: form.body,
      pillar: pillars?.find((p) => p.id === form.pillarId)?.name ?? null,
      scheduledAt: form.scheduledAt,
      variants: NETWORKS.filter((n) => form.variants[n]).map((n) => ({
        network: n,
        kind: form.variants[n]!.kind,
        text: form.variants[n]!.text
      }))
    }
  })

  // Recibe lo que el asistente quiera insertar (texto base, versión por red, hashtags).
  const setMounted = useComposerBridge((s) => s.setMounted)
  const takeInsert = useComposerBridge((s) => s.take)
  React.useEffect(() => {
    setMounted(true)
    const apply = (insert: ComposerInsert | null): void => {
      if (!insert) return
      setForm((current) => {
        if (insert.kind === 'body') return { ...current, body: insert.text }
        if (insert.kind === 'appendBody') return { ...current, body: current.body + insert.text }
        const variant = current.variants[insert.network] ?? {
          kind: NETWORK_META[insert.network].defaultKind,
          text: '',
          extra: {}
        }
        return {
          ...current,
          variants: { ...current.variants, [insert.network]: { ...variant, text: insert.text } }
        }
      })
      setDirty(true)
      if (insert.kind === 'variant') setActiveNetwork(insert.network)
    }
    // Lo que ya esperaba antes de montar, y lo que llegue después.
    queueMicrotask(() => apply(takeInsert()))
    const unsubscribe = useComposerBridge.subscribe((state) => {
      if (state.pending) apply(takeInsert())
    })
    return () => {
      unsubscribe()
      setMounted(false)
    }
  }, [setMounted, takeInsert])
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const patch = (changes: Partial<FormState>): void => {
    setForm((current) => ({ ...current, ...changes }))
    setDirty(true)
  }

  const toggleNetwork = (network: Network): void => {
    const variants = { ...form.variants }
    if (variants[network]) {
      delete variants[network]
      if (activeNetwork === network)
        setActiveNetwork((Object.keys(variants)[0] as Network | undefined) ?? null)
    } else {
      variants[network] = { kind: NETWORK_META[network].defaultKind, text: form.body, extra: {} }
      setActiveNetwork(network)
    }
    patch({ variants })
  }

  const patchVariant = (network: Network, changes: Partial<VariantState>): void => {
    const current = form.variants[network]
    if (!current) return
    patch({ variants: { ...form.variants, [network]: { ...current, ...changes } } })
  }

  const save = (): void => {
    const payload = toPayload(form)
    if (postId) {
      update.mutate({ id: postId, patch: payload }, { onSuccess: () => setDirty(false) })
    } else {
      create.mutate(payload, {
        onSuccess: (created) => {
          setDirty(false)
          void navigate(`/compose/${created.post.id}`, { replace: true })
        }
      })
    }
  }

  const pending = create.isPending || update.isPending
  const error = create.error ?? update.error
  const active = activeNetwork ? form.variants[activeNetwork] : undefined

  return (
    <>
      <PageHeader
        title={postId ? 'Editar publicación' : 'Nueva publicación'}
        description="Escribe una vez, adapta a cada red y mira cómo quedará antes de programarla."
        actions={
          <>
            {status && (
              <Badge tone={status === 'scheduled' ? 'accent' : 'neutral'}>
                {POST_STATUS_LABELS[status]}
              </Badge>
            )}
            {dirty && <span className="text-xs text-warning">Cambios sin guardar</span>}
            {postId && (
              <Button
                variant="ghost"
                className="text-danger"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 aria-hidden /> Eliminar
              </Button>
            )}
            <Button onClick={save} disabled={pending || !form.title.trim()}>
              <Save aria-hidden /> {postId ? 'Guardar' : 'Guardar borrador'}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div className="grid grid-cols-[1fr_200px] gap-3">
              <Field
                label="Título interno"
                htmlFor="post-title"
                hint="Solo lo ves tú, para reconocerla en el calendario."
              >
                <Input
                  id="post-title"
                  value={form.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  placeholder="Reel: 3 errores al empezar"
                  autoFocus={!postId}
                />
              </Field>
              <Field label="Pilar" htmlFor="post-pillar">
                <PillarSelect
                  id="post-pillar"
                  value={form.pillarId}
                  onChange={(pillarId) => patch({ pillarId })}
                />
              </Field>
            </div>
            <Field
              label="Texto base"
              htmlFor="post-body"
              hint="El punto de partida. Cada red puede tener su propia versión."
            >
              <Textarea
                id="post-body"
                rows={7}
                value={form.body}
                onChange={(e) => patch({ body: e.target.value })}
                placeholder="Escribe aquí la idea completa…"
              />
            </Field>
          </section>

          <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div>
              <p className="mb-2 text-sm font-medium">Redes</p>
              <div role="group" aria-label="Redes de destino" className="flex flex-wrap gap-2">
                {NETWORKS.map((network) => {
                  const enabled = !!form.variants[network]
                  return (
                    <button
                      key={network}
                      type="button"
                      aria-pressed={enabled}
                      onClick={() => toggleNetwork(network)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-sm font-medium transition-base',
                        enabled
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-border text-muted hover:text-text'
                      )}
                    >
                      {NETWORK_META[network].label}
                    </button>
                  )
                })}
              </div>
            </div>

            {Object.keys(form.variants).length > 0 && (
              <>
                <div
                  role="tablist"
                  aria-label="Adaptación por red"
                  className="flex gap-1 border-b border-border"
                >
                  {NETWORKS.filter((n) => form.variants[n]).map((network) => (
                    <button
                      key={network}
                      role="tab"
                      type="button"
                      aria-selected={activeNetwork === network}
                      onClick={() => setActiveNetwork(network)}
                      className={cn(
                        '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-base',
                        activeNetwork === network
                          ? 'border-accent text-accent'
                          : 'border-transparent text-muted hover:text-text'
                      )}
                    >
                      {NETWORK_META[network].label}
                    </button>
                  ))}
                </div>

                {activeNetwork && active && (
                  <div role="tabpanel" className="flex flex-col gap-4">
                    <div className="grid grid-cols-[200px_1fr] items-end gap-3">
                      <Field label="Formato" htmlFor="variant-kind">
                        <Select
                          value={active.kind}
                          onValueChange={(kind) =>
                            patchVariant(activeNetwork, { kind: kind as PostKind })
                          }
                        >
                          <SelectTrigger id="variant-kind">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {NETWORK_META[activeNetwork].kinds.map((kind) => (
                              <SelectItem key={kind} value={kind}>
                                {KIND_META[kind].label} · {KIND_META[kind].aspect}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-self-start"
                        onClick={() => patchVariant(activeNetwork, { text: form.body })}
                      >
                        <Copy aria-hidden /> Copiar texto base
                      </Button>
                    </div>
                    {NETWORK_META[activeNetwork].extraFields.map((field) => (
                      <Field
                        key={field.key}
                        label={field.label}
                        htmlFor={`variant-${field.key}`}
                        hint={`Máximo ${field.maxChars} caracteres`}
                      >
                        <Input
                          id={`variant-${field.key}`}
                          value={active.extra[field.key] ?? ''}
                          onChange={(e) =>
                            patchVariant(activeNetwork, {
                              extra: { ...active.extra, [field.key]: e.target.value }
                            })
                          }
                        />
                      </Field>
                    ))}
                    <Field
                      label={`Texto para ${NETWORK_META[activeNetwork].label}`}
                      htmlFor="variant-text"
                    >
                      <Textarea
                        id="variant-text"
                        rows={6}
                        value={active.text}
                        onChange={(e) => patchVariant(activeNetwork, { text: e.target.value })}
                      />
                    </Field>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Medios</p>
              <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                <ImagePlus aria-hidden /> Añadir
              </Button>
            </div>
            {form.media.length === 0 ? (
              <p className="text-sm text-muted">
                Sin imágenes ni vídeos. Los formatos de Instagram y YouTube los necesitan.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {form.media.map((asset, index) => (
                  <li
                    key={asset.id}
                    className="flex items-center gap-3 rounded-md border border-border p-2"
                  >
                    <div className="size-14 shrink-0 overflow-hidden rounded-sm bg-surface-2">
                      <MediaThumb asset={asset} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {index + 1}. {asset.originalName}
                      </p>
                      <Input
                        aria-label={`Texto alternativo de ${asset.originalName}`}
                        placeholder="Texto alternativo (describe la imagen para accesibilidad)"
                        className="mt-1 h-8 text-xs"
                        defaultValue={asset.altText}
                        onBlur={(e) => {
                          if (e.target.value !== asset.altText)
                            updateMedia.mutate({ id: asset.id, patch: { altText: e.target.value } })
                        }}
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      aria-label={`Quitar ${asset.originalName}`}
                      onClick={() => patch({ media: form.media.filter((m) => m.id !== asset.id) })}
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm sm:grid-cols-2">
            <Field
              label="Programar para"
              htmlFor="post-scheduled"
              hint="Sin fecha, queda como borrador en la bandeja del calendario."
            >
              <div className="flex gap-2">
                <Input
                  id="post-scheduled"
                  type="datetime-local"
                  value={toDateTimeLocal(form.scheduledAt)}
                  onChange={(e) => patch({ scheduledAt: fromDateTimeLocal(e.target.value) })}
                />
                {form.scheduledAt && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Quitar fecha"
                    onClick={() => patch({ scheduledAt: null })}
                  >
                    <CalendarClock aria-hidden />
                  </Button>
                )}
              </div>
            </Field>
            <Field label="Notas internas" htmlFor="post-notes">
              <Textarea
                id="post-notes"
                rows={2}
                className="min-h-9"
                value={form.notes}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </Field>
          </section>

          {error && (
            <p role="alert" className="text-sm text-danger">
              No se pudo guardar: {error.message}
            </p>
          )}
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-3 text-sm font-medium">Vista previa</p>
          {activeNetwork && active ? (
            <NetworkPreview
              network={activeNetwork}
              kind={active.kind}
              text={active.text}
              extra={active.extra}
              media={form.media}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-muted">
              Activa una red para ver cómo quedará la publicación.
            </div>
          )}
        </aside>
      </div>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedIds={form.media.map((m) => m.id)}
        onConfirm={(media) => patch({ media })}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="¿Eliminar esta publicación?"
        description="Desaparecerá del calendario. Los medios siguen en la biblioteca."
        confirmLabel="Eliminar"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          postId && remove.mutate({ id: postId }, { onSuccess: () => void navigate('/calendar') })
        }
      />
    </>
  )
}
