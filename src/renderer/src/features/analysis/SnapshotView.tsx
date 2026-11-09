import * as React from 'react'
import { ExternalLink } from 'lucide-react'
import { SNAPSHOT_SOURCE_LABELS, type Snapshot } from '@shared/domain/analysis'
import { Button } from '@renderer/components/ui/button'
import { fmtDateTime } from '@renderer/lib/dates'
import { invoke } from '@renderer/lib/ipc'
import { POST_NUMBER_FIELDS, fmtCount } from './draft'

function Stat({ label, value }: { label: string; value: number | null }): React.JSX.Element {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{fmtCount(value)}</p>
    </div>
  )
}

/** Datos guardados de una cuenta, de solo lectura. */
export function SnapshotView({ snapshot }: { snapshot: Snapshot }): React.JSX.Element {
  const { data } = snapshot
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        {SNAPSHOT_SOURCE_LABELS[snapshot.source]} · {fmtDateTime(snapshot.capturedAt)}
        {data.period && ` · ${data.period}`}
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Stat label="Seguidores" value={data.followers} />
        <Stat label="Siguiendo" value={data.following} />
        <Stat label="Publicaciones" value={data.postsCount} />
      </div>
      {data.bio && <p className="text-sm whitespace-pre-line text-muted">{data.bio}</p>}

      {data.metrics.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-semibold">Estadísticas</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.metrics.map((m, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>{m.label}</span>
                <span className="text-right">
                  <span className="font-semibold tabular-nums">{fmtCount(m.value)}</span>
                  {m.note && <span className="block text-xs text-muted">{m.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.posts.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-semibold">Publicaciones ({data.posts.length})</h3>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Formato</th>
                  <th className="px-2 py-1.5 font-medium">Fecha</th>
                  <th className="px-2 py-1.5 font-medium">Texto</th>
                  {POST_NUMBER_FIELDS.map((f) => (
                    <th key={f.key} className="px-2 py-1.5 text-right font-medium">
                      {f.label}
                    </th>
                  ))}
                  <th className="sr-only">Enlace</th>
                </tr>
              </thead>
              <tbody>
                {data.posts.map((p, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1.5">{p.format}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{p.publishedAt ?? '—'}</td>
                    <td className="max-w-72 truncate px-2 py-1.5" title={p.caption ?? ''}>
                      {p.caption ?? '—'}
                    </td>
                    {POST_NUMBER_FIELDS.map((f) => (
                      <td key={f.key} className="px-2 py-1.5 text-right tabular-nums">
                        {fmtCount(p[f.key])}
                      </td>
                    ))}
                    <td className="px-1 py-0.5">
                      {p.url?.startsWith('https://') && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label={`Abrir la publicación ${i + 1} en el navegador`}
                          onClick={() => void invoke('app:openExternal', { url: p.url! })}
                        >
                          <ExternalLink aria-hidden />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data.observations && (
        <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">{data.observations}</p>
      )}
    </div>
  )
}
