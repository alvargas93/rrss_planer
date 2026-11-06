import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, readFile, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { imageSize } from 'image-size'
import type { MediaAsset } from '@shared/domain/media'
import { IMAGE_EXTENSIONS, MIME_BY_EXTENSION, VIDEO_EXTENSIONS } from '@shared/domain/media'
import { AppError } from '@shared/domain/errors'
import { newId } from '../db/helpers'
import type { MediaRepository } from '../repositories/media.repository'
import { createLogger } from '../log'

const log = createLogger('media')

/** Quién abre el diálogo de archivos: se inyecta para poder probar el servicio sin Electron. */
export type FilePicker = () => Promise<string[]>

export const MEDIA_FILE_FILTERS = [
  { name: 'Imágenes y vídeos', extensions: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS] },
  { name: 'Imágenes', extensions: [...IMAGE_EXTENSIONS] },
  { name: 'Vídeos', extensions: [...VIDEO_EXTENSIONS] }
]

function sha256OfFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}

export class MediaService {
  constructor(
    private readonly repo: MediaRepository,
    private readonly mediaDir: string,
    private readonly pickFiles: FilePicker
  ) {}

  list(): MediaAsset[] {
    return this.repo.list()
  }

  /** Abre el selector del sistema y copia cada archivo elegido a la carpeta de medios. */
  async import(): Promise<MediaAsset[]> {
    const paths = await this.pickFiles()
    const imported: MediaAsset[] = []
    for (const path of paths) imported.push(await this.importFile(path))
    return imported
  }

  async importFile(sourcePath: string): Promise<MediaAsset> {
    const ext = extname(sourcePath).slice(1).toLowerCase()
    const meta = MIME_BY_EXTENSION[ext]
    if (!meta) {
      throw new AppError('VALIDATION', `Formato no admitido: .${ext || '?'}`, { path: sourcePath })
    }

    const sha256 = await sha256OfFile(sourcePath)
    const existing = this.repo.findBySha(sha256)
    if (existing) {
      log.info(`Archivo ya importado, se reutiliza: ${existing.originalName}`)
      return existing
    }

    const id = newId()
    const fileName = `${id}.${ext}`
    await copyFile(sourcePath, join(this.mediaDir, fileName))
    const { size } = await stat(sourcePath)

    let width: number | null = null
    let height: number | null = null
    if (meta.kind === 'image') {
      try {
        const dims = imageSize(await readFile(sourcePath))
        width = dims.width ?? null
        height = dims.height ?? null
      } catch (error) {
        log.warn(`No se pudieron leer las dimensiones de ${basename(sourcePath)}`, error)
      }
    }

    return this.repo.create({
      id,
      fileName,
      originalName: basename(sourcePath),
      kind: meta.kind,
      mime: meta.mime,
      width,
      height,
      durationMs: null, // se rellena con ffprobe en la Fase 6
      sizeBytes: size,
      sha256
    })
  }

  update(id: string, patch: { altText?: string }): MediaAsset {
    return this.repo.update(id, patch)
  }

  delete(id: string): void {
    this.repo.delete(id)
  }
}
