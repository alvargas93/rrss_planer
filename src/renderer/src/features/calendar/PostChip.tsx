import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Image as ImageIcon } from 'lucide-react'
import type { PostSummary } from '@shared/domain/posts'
import { NETWORK_META } from '@shared/connectors/networks'
import { usePillars } from '@renderer/features/pillars/usePillars'
import { fmtTime } from '@renderer/lib/dates'
import { cn } from '@renderer/lib/utils'

interface PostChipProps {
  post: PostSummary
  onOpen: (post: PostSummary) => void
  compact?: boolean
  overlay?: boolean
}

/** Tarjeta pequeña de publicación para el calendario y la bandeja de borradores. */
export function PostChip({
  post,
  onOpen,
  compact = false,
  overlay = false
}: PostChipProps): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `post:${post.id}`,
    data: { post },
    disabled: overlay
  })
  const { data: pillars = [] } = usePillars()
  const pillar = pillars.find((p) => p.id === post.pillarId)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        'group flex w-full cursor-grab touch-none items-stretch gap-1.5 overflow-hidden rounded-md border border-border bg-surface text-left shadow-sm transition-base active:cursor-grabbing',
        isDragging && !overlay && 'opacity-30',
        overlay && 'rotate-1 shadow-lg ring-2 ring-accent',
        !overlay && 'hover:shadow-md'
      )}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`${post.title}${post.scheduledAt ? `, ${fmtTime(post.scheduledAt)}` : ''}`}
      onClick={() => onOpen(post)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(post)
      }}
    >
      <span
        aria-hidden
        className="w-1 shrink-0"
        style={{ backgroundColor: pillar?.color ?? 'var(--border-strong)' }}
      />
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col gap-0.5 py-1 pr-1.5',
          compact ? 'text-[11px]' : 'text-xs'
        )}
      >
        <span className="flex items-center gap-1">
          {post.scheduledAt && (
            <span className="font-semibold text-muted">{fmtTime(post.scheduledAt)}</span>
          )}
          <span className="truncate font-medium">{post.title}</span>
        </span>
        {!compact && (
          <span className="flex items-center gap-1 text-[10px] text-subtle">
            {post.networks.length > 0
              ? post.networks.map((n) => NETWORK_META[n].label).join(' · ')
              : 'Sin red'}
            {post.mediaCount > 0 && (
              <span className="inline-flex items-center gap-0.5">
                · <ImageIcon size={10} aria-hidden /> {post.mediaCount}
              </span>
            )}
          </span>
        )}
      </div>
      {post.thumbnailUrl && !compact && (
        <img
          src={post.thumbnailUrl}
          alt=""
          className="size-10 shrink-0 object-cover"
          draggable={false}
        />
      )}
    </div>
  )
}
