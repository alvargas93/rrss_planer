import * as React from 'react'
import { Check, CheckCircle2, Copy, ExternalLink, FolderDown, Undo2 } from 'lucide-react'
import { NETWORK_META, kindLabel, type Network, type PostKind } from '@shared/connectors/networks'
import type { PostTarget } from '@shared/domain/publishing'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Input } from '@renderer/components/ui/input'
import { invoke } from '@renderer/lib/ipc'
import { fmtDateTime } from '@renderer/lib/dates'
import { keys, useIpcMutation } from '@renderer/lib/queries'

interface ManualKitProps {
  postId: string
  targets: PostTarget[]
  variants: Array<{ network: Network; kind: PostKind; text: string }>
  mediaCount: number
  dirty: boolean
  scheduledAt: string | null
}

/**
 * Publicación a mano (modo por defecto desde la Fase 9): copiar el texto, guardar los
 * archivos con un nombre claro y marcar cada red como publicada.
 */
export function ManualKit({
  postId,
  targets,
  variants,
  mediaCount,
  dirty,
  scheduledAt
}: ManualKitProps): React.JSX.Element {
  const mark = useIpcMutation('publishing:markManual', [keys.posts, keys.dashboard])
  const exportMedia = useIpcMutation('posts:exportMedia', [])
  const [copied, setCopied] = React.useState<Network | null>(null)
  const [linkFor, setLinkFor] = React.useState<Network | null>(null)
  const [link, setLink] = React.useState('')
  const [exportedDir, setExportedDir] = React.useState<string | null>(null)
  const [copyError, setCopyError] = React.useState<string | null>(null)

  const copy = async (network: Network, text: string): Promise<void> => {
    try {
      await invoke('app:copyText', { text })
      setCopyError(null)
      setCopied(network)
      setTimeout(() => setCopied((current) => (current === network ? null : current)), 2000)
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : 'No se pudo copiar el texto.')
    }
  }

  const error = mark.error?.message ?? exportMedia.error?.message ?? copyError

  return (
    <section
      aria-label="Publicar a mano"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Publicar a mano</p>
        {scheduledAt && (
          <span className="text-xs text-muted">Para el {fmtDateTime(scheduledAt)}</span>
        )}
      </div>
      <p className="text-xs text-muted">
        {scheduledAt
          ? 'A esa hora la app te avisará y dejará el texto copiado. Cuando lo publiques, márcalo aquí.'
          : 'Ponle fecha y hora para que la app te avise cuando toque publicar.'}
      </p>
      {dirty && <p className="text-xs text-warning">Guarda los cambios antes de copiar.</p>}

      {mediaCount > 0 && (
        <div className="flex flex-col gap-1">
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            disabled={dirty || exportMedia.isPending}
            onClick={() =>
              exportMedia.mutate({ id: postId }, { onSuccess: (r) => r && setExportedDir(r.dir) })
            }
          >
            <FolderDown aria-hidden /> Guardar{' '}
            {mediaCount === 1 ? 'el archivo' : `los ${mediaCount} archivos`}
          </Button>
          {exportedDir && (
            <p role="status" className="text-xs text-success">
              Guardados en {exportedDir}
            </p>
          )}
        </div>
      )}

      {variants.length === 0 && (
        <p className="text-sm text-muted">Activa una red para preparar su texto.</p>
      )}
      <ul className="flex flex-col gap-3">
        {variants.map((variant) => {
          const target = targets.find((t) => t.network === variant.network)
          const published = target?.status === 'published'
          const label = NETWORK_META[variant.network].label
          return (
            <li
              key={variant.network}
              className="flex flex-col gap-2 rounded-md border border-border p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{label}</span>
                <span className="text-xs text-muted">
                  {kindLabel(variant.network, variant.kind)}
                </span>
                <Badge
                  tone={
                    published
                      ? 'success'
                      : target?.status === 'manual_notified'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {published
                    ? 'Publicada'
                    : target?.status === 'manual_notified'
                      ? 'Ya es la hora'
                      : 'Pendiente'}
                </Badge>
                {published && target?.externalUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7"
                    onClick={() => void invoke('app:openExternal', { url: target.externalUrl! })}
                  >
                    <ExternalLink aria-hidden /> Ver
                  </Button>
                )}
              </div>
              {published && target?.publishedAt && (
                <p className="flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle2 size={13} aria-hidden /> Marcada como publicada el{' '}
                  {fmtDateTime(target.publishedAt)}
                </p>
              )}
              {linkFor === variant.network ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    mark.mutate(
                      {
                        postId,
                        network: variant.network,
                        published: true,
                        url: link.trim() || null
                      },
                      {
                        onSuccess: () => {
                          setLinkFor(null)
                          setLink('')
                        }
                      }
                    )
                  }}
                >
                  <Input
                    aria-label={`Enlace a la publicación en ${label} (opcional)`}
                    placeholder="Enlace a la publicación (opcional)"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" type="submit" disabled={mark.isPending}>
                      <Check aria-hidden /> Confirmar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setLinkFor(null)}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={dirty || !variant.text.trim()}
                    onClick={() => void copy(variant.network, variant.text)}
                  >
                    {copied === variant.network ? <Check aria-hidden /> : <Copy aria-hidden />}
                    {copied === variant.network ? 'Copiado' : 'Copiar texto'}
                  </Button>
                  {published ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={mark.isPending}
                      onClick={() =>
                        mark.mutate({
                          postId,
                          network: variant.network,
                          published: false,
                          url: null
                        })
                      }
                    >
                      <Undo2 aria-hidden /> Desmarcar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={dirty}
                      onClick={() => {
                        setLink('')
                        setLinkFor(variant.network)
                      }}
                    >
                      <CheckCircle2 aria-hidden /> Ya la publiqué
                    </Button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  )
}
