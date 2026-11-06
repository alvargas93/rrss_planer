import * as React from 'react'
import { Bookmark, Heart, ImageIcon, MessageCircle, Send } from 'lucide-react'
import {
  KIND_META,
  NETWORK_META,
  aspectToRatio,
  extractHashtags,
  type Network,
  type PostKind
} from '@shared/connectors/networks'
import type { MediaAsset } from '@shared/domain/media'
import { MediaThumb } from '@renderer/features/media/MediaThumb'
import { cn } from '@renderer/lib/utils'

interface NetworkPreviewProps {
  network: Network
  kind: PostKind
  text: string
  extra: Record<string, string>
  media: MediaAsset[]
  accountName?: string
}

function MediaFrame({
  media,
  kind,
  className
}: {
  media: MediaAsset[]
  kind: PostKind
  className?: string
}): React.JSX.Element {
  const meta = KIND_META[kind]
  const first = media[0]
  return (
    <div
      className={cn('relative w-full overflow-hidden bg-surface-3', className)}
      style={{ aspectRatio: String(aspectToRatio(meta.aspect)) }}
    >
      {first ? (
        first.kind === 'video' ? (
          <video
            src={first.url}
            className="size-full object-cover"
            muted
            playsInline
            controls={false}
            aria-label={first.originalName}
          />
        ) : (
          <MediaThumb asset={first} />
        )
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-subtle">
          <ImageIcon size={26} strokeWidth={1.5} aria-hidden />
          <span className="text-[11px]">
            {meta.label} · {meta.aspect}
          </span>
        </div>
      )}
      {kind === 'carousel' && media.length > 1 && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1" aria-hidden>
          {media.map((m, i) => (
            <span
              key={m.id}
              className={cn('size-1.5 rounded-full', i === 0 ? 'bg-white' : 'bg-white/50')}
            />
          ))}
        </div>
      )}
      {kind === 'carousel' && media.length > 1 && (
        <span className="absolute top-2 right-2 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          1/{media.length}
        </span>
      )}
    </div>
  )
}

function Caption({
  text,
  foldAfter,
  prefix
}: {
  text: string
  foldAfter: number | null
  prefix?: string
}): React.JSX.Element {
  const [expanded, setExpanded] = React.useState(false)
  const folded = foldAfter !== null && text.length > foldAfter && !expanded
  const shown = folded ? text.slice(0, foldAfter).trimEnd() : text
  return (
    <p className="text-[13px] leading-5 whitespace-pre-line">
      {prefix && <span className="font-semibold">{prefix} </span>}
      {shown || <span className="text-subtle">Tu texto aparecerá aquí…</span>}
      {folded && (
        <>
          …{' '}
          <button type="button" onClick={() => setExpanded(true)} className="text-subtle">
            más
          </button>
        </>
      )}
    </p>
  )
}

/**
 * Vista previa genérica de cómo se verá la publicación en cada red: proporciones,
 * recorte del texto y campos propios. No copia la interfaz real de ninguna marca.
 */
export function NetworkPreview({
  network,
  kind,
  text,
  extra,
  media,
  accountName = 'tu_cuenta'
}: NetworkPreviewProps): React.JSX.Element {
  const meta = NETWORK_META[network]
  const chars = text.length
  const over = chars > meta.maxChars
  const hashtags = extractHashtags(text)
  const tooManyTags = meta.maxHashtags !== null && hashtags.length > meta.maxHashtags

  const header = (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <span className="grid size-8 place-items-center rounded-full bg-accent-gradient p-[2px]">
        <span className="size-full rounded-full bg-surface" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[13px] font-semibold">{accountName}</p>
        <p className="text-[11px] text-subtle">Ahora · {meta.label}</p>
      </div>
    </div>
  )

  const actions = (
    <div className="flex items-center gap-3 px-3 py-2 text-muted" aria-hidden>
      <Heart size={18} strokeWidth={1.75} />
      <MessageCircle size={18} strokeWidth={1.75} />
      <Send size={18} strokeWidth={1.75} />
      <Bookmark size={18} strokeWidth={1.75} className="ml-auto" />
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {header}
        {network === 'youtube' ? (
          <>
            <MediaFrame media={media} kind={kind} />
            <div className="px-3 py-2.5">
              <p className="text-[14px] leading-snug font-semibold">
                {extra['title'] || <span className="text-subtle">Título del vídeo</span>}
              </p>
              <p className="mt-1 text-[11px] text-subtle">{accountName} · 0 visualizaciones</p>
              <div className="mt-2 rounded-md bg-surface-2 p-2">
                <Caption text={text} foldAfter={140} />
              </div>
            </div>
          </>
        ) : network === 'instagram' ? (
          <>
            <MediaFrame media={media} kind={kind} />
            {actions}
            <div className="px-3 pb-3">
              <Caption text={text} foldAfter={meta.foldAfter} prefix={accountName} />
            </div>
          </>
        ) : (
          <>
            <div className="px-3 pb-2">
              <Caption text={text} foldAfter={meta.foldAfter} />
            </div>
            {media.length > 0 && (
              <MediaFrame media={media} kind={kind} className="border-t border-border" />
            )}
            {actions}
          </>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-surface-2 px-3 py-2">
          <dt className="text-subtle">Caracteres</dt>
          <dd className={cn('font-semibold', over && 'text-danger')}>
            {chars} / {meta.maxChars}
          </dd>
        </div>
        <div className="rounded-md bg-surface-2 px-3 py-2">
          <dt className="text-subtle">Hashtags</dt>
          <dd className={cn('font-semibold', tooManyTags && 'text-danger')}>
            {hashtags.length}
            {meta.maxHashtags !== null && ` / ${meta.maxHashtags}`}
          </dd>
        </div>
        {meta.extraFields.map((field) => (
          <div key={field.key} className="rounded-md bg-surface-2 px-3 py-2">
            <dt className="text-subtle">{field.label}</dt>
            <dd
              className={cn(
                'font-semibold',
                (extra[field.key]?.length ?? 0) > field.maxChars && 'text-danger'
              )}
            >
              {extra[field.key]?.length ?? 0} / {field.maxChars}
            </dd>
          </div>
        ))}
        <div className="rounded-md bg-surface-2 px-3 py-2">
          <dt className="text-subtle">Medios</dt>
          <dd
            className={cn(
              'font-semibold',
              KIND_META[kind].requiresMedia && media.length === 0 && 'text-warning'
            )}
          >
            {media.length} / {KIND_META[kind].maxMedia}
            {KIND_META[kind].requiresMedia && media.length === 0 && ' · hace falta al menos 1'}
          </dd>
        </div>
      </dl>
      <p className="text-[11px] text-subtle">
        Límites orientativos. Se confirman con la documentación oficial al conectar cada red.
      </p>
    </div>
  )
}
