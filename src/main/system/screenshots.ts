import { nativeImage } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { SCREENSHOT_EXTENSIONS } from '@shared/domain/analysis'
import { AppError } from '@shared/domain/errors'
import type { GenerateImage } from '../ai/ai.service'

/**
 * Lado más largo con el que se envía cada captura. Por encima de este tamaño la API la
 * reduce igualmente, así que reducirla antes ahorra subida sin perder legibilidad.
 */
const MAX_EDGE = 1568
/** Límite de la API por imagen (5 MB); WebP se envía tal cual. */
const MAX_RAW_BYTES = 5 * 1024 * 1024

export const SCREENSHOT_FILTERS = [
  { name: 'Capturas (PNG, JPG, WebP)', extensions: [...SCREENSHOT_EXTENSIONS] }
]

/** Lee una captura y la deja lista para Claude: JPEG de como mucho 1568 px de lado. */
export async function loadScreenshot(path: string): Promise<GenerateImage> {
  const name = basename(path)
  if (extname(path).toLowerCase() === '.webp') {
    const info = await stat(path)
    if (info.size > MAX_RAW_BYTES) {
      throw new AppError('VALIDATION', `«${name}» pesa más de 5 MB. Guárdala como PNG o JPG.`)
    }
    return { mediaType: 'image/webp', base64: (await readFile(path)).toString('base64') }
  }
  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) throw new AppError('VALIDATION', `No se pudo leer la imagen «${name}».`)
  const { width, height } = image.getSize()
  const scaled =
    Math.max(width, height) > MAX_EDGE
      ? image.resize(
          width >= height
            ? { width: MAX_EDGE, quality: 'best' }
            : { height: MAX_EDGE, quality: 'best' }
        )
      : image
  return { mediaType: 'image/jpeg', base64: scaled.toJPEG(85).toString('base64') }
}
