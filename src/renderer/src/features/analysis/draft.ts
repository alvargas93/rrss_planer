import { parseCountInput, type PostData, type ProfileData } from '@shared/domain/analysis'

/**
 * Estado editable de los datos de una cuenta: las cifras se guardan como texto mientras se
 * escriben y se convierten a número al guardar.
 */
export interface MetricDraft {
  key: number
  label: string
  value: string
  note: string
}

export interface PostDraft {
  key: number
  format: string
  publishedAt: string
  caption: string
  views: string
  likes: string
  comments: string
  shares: string
  saves: string
  url: string
}

export interface ProfileDraft {
  displayName: string
  bio: string
  followers: string
  following: string
  postsCount: string
  period: string
  metrics: MetricDraft[]
  posts: PostDraft[]
  observations: string
}

export const POST_NUMBER_FIELDS = [
  { key: 'views', label: 'Vistas' },
  { key: 'likes', label: 'Me gusta' },
  { key: 'comments', label: 'Coment.' },
  { key: 'shares', label: 'Compart.' },
  { key: 'saves', label: 'Guard.' }
] as const

let nextKey = 1
export const newKey = (): number => nextKey++

const str = (n: number | null): string => (n === null ? '' : String(n))

export function emptyPost(): PostDraft {
  return {
    key: newKey(),
    format: '',
    publishedAt: '',
    caption: '',
    views: '',
    likes: '',
    comments: '',
    shares: '',
    saves: '',
    url: ''
  }
}

export function emptyMetric(): MetricDraft {
  return { key: newKey(), label: '', value: '', note: '' }
}

export function toDraft(data: ProfileData): ProfileDraft {
  return {
    displayName: data.displayName ?? '',
    bio: data.bio ?? '',
    followers: str(data.followers),
    following: str(data.following),
    postsCount: str(data.postsCount),
    period: data.period ?? '',
    metrics: data.metrics.map((m) => ({
      key: newKey(),
      label: m.label,
      value: str(m.value),
      note: m.note ?? ''
    })),
    posts: data.posts.map((p) => ({
      key: newKey(),
      format: p.format,
      publishedAt: p.publishedAt ?? '',
      caption: p.caption ?? '',
      views: str(p.views),
      likes: str(p.likes),
      comments: str(p.comments),
      shares: str(p.shares),
      saves: str(p.saves),
      url: p.url ?? ''
    })),
    observations: data.observations
  }
}

export const isInvalidNumber = (raw: string): boolean => parseCountInput(raw) === 'invalid'

const orNull = (text: string): string | null => (text.trim() ? text.trim() : null)

/** Convierte el borrador en datos; null si alguna cifra no es un número. */
export function fromDraft(draft: ProfileDraft): ProfileData | null {
  const num = (raw: string): number | null => {
    const value = parseCountInput(raw)
    if (value === 'invalid') throw new Error('cifra no válida')
    return value
  }
  try {
    const posts: PostData[] = draft.posts
      .filter((p) => p.format.trim() || p.caption.trim() || p.views || p.likes)
      .map((p) => ({
        format: p.format.trim() || 'publicación',
        publishedAt: orNull(p.publishedAt),
        caption: orNull(p.caption),
        views: num(p.views),
        likes: num(p.likes),
        comments: num(p.comments),
        shares: num(p.shares),
        saves: num(p.saves),
        url: orNull(p.url)
      }))
    return {
      displayName: orNull(draft.displayName),
      bio: orNull(draft.bio),
      followers: num(draft.followers),
      following: num(draft.following),
      postsCount: num(draft.postsCount),
      period: orNull(draft.period),
      metrics: draft.metrics
        .filter((m) => m.label.trim())
        .map((m) => ({ label: m.label.trim(), value: num(m.value), note: orNull(m.note) })),
      posts,
      observations: draft.observations.trim()
    }
  } catch {
    return null
  }
}

export function fmtCount(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('es-ES')
}

export function fmtUsd(value: number): string {
  return value < 0.01 ? 'menos de 0,01 $' : `${value.toFixed(2).replace('.', ',')} $`
}
