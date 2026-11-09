import { constants } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { dayKey } from '@shared/domain/analysis'
import { AppError } from '@shared/domain/errors'
import type { PostDetail } from '@shared/domain/posts'

/** Caracteres que Windows o macOS no admiten en nombres de archivo. */
// eslint-disable-next-line no-control-regex
const UNSAFE = /[<>:"/\\|?*\u0000-\u001f]/g

/** Parte del nombre de archivo a partir de un título. Pura (probada). */
export function safeFileStem(title: string): string {
  const stem = title
    .replace(UNSAFE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/[. ]+$/, '')
  return stem || 'publicacion'
}

/**
 * Nombres con los que se guardan los archivos de una publicación para subirlos a mano:
 * «2026-11-10 Título 1.jpg», en el orden del carrusel. Pura (probada).
 */
export function exportFileNames(
  post: { title: string; scheduledAt: string | null },
  media: Array<{ fileName: string; originalName: string }>,
  today = new Date()
): string[] {
  const date = dayKey(post.scheduledAt ? new Date(post.scheduledAt) : today)
  const stem = `${date} ${safeFileStem(post.title)}`
  return media.map((m, i) => {
    const ext = (extname(m.fileName) || extname(m.originalName)).toLowerCase()
    return media.length === 1 ? `${stem}${ext}` : `${stem} ${i + 1}${ext}`
  })
}

/** Copia los archivos de la publicación a una carpeta, sin sobrescribir nada. */
export async function exportPostMedia(
  detail: Pick<PostDetail, 'post' | 'media'>,
  mediaDir: string,
  destDir: string
): Promise<string[]> {
  const names = exportFileNames(detail.post, detail.media)
  const written: string[] = []
  for (const [i, asset] of detail.media.entries()) {
    const name = names[i]!
    const ext = extname(name)
    const base = name.slice(0, name.length - ext.length)
    const source = join(mediaDir, asset.fileName)
    let target = join(destDir, name)
    for (let n = 2; ; n++) {
      try {
        await copyFile(source, target, constants.COPYFILE_EXCL)
        break
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'EEXIST' && n < 100) {
          target = join(destDir, `${base} (${n})${ext}`)
          continue
        }
        if (code === 'ENOENT') {
          throw new AppError(
            'IO',
            `No se encontró «${asset.originalName}» en la biblioteca de medios.`
          )
        }
        throw new AppError('IO', `No se pudo guardar «${name}»: ${(error as Error).message}`)
      }
    }
    written.push(target)
  }
  return written
}
