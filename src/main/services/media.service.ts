import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { imageSize } from 'image-size'
import type { MediaAsset } from '@shared/domain/media'
import { IMAGE_EXTENSIONS, MIME_BY_EXTENSION, VIDEO_EXTENSIONS } from '@shared/domain/media'
import { AppError } from '@shared/domain/errors'
import { newId } from '../db/helpers'
import type { MediaRepository } from '../repositories/media.repository'
import * as ffmpeg from '../video/ffmpeg'
import { createLogger } from '../log'

const log = createLogger('media')

/** Quién abre el diálogo de archivos: se inyecta para poder probar el servicio sin Electron. */
export type FilePicker = () => Promise<string[]>

/** Herramientas de vídeo/imagen; se inyectan para probar sin FFmpeg. */
export interface MediaProcessors {
  probe: typeof ffmpeg.probe
  thumbnail: typeof ffmpeg.thumbnail
  toJpeg: typeof ffmpeg.toJpeg
}

export const MEDIA_FILE_FILTERS = [
  { name: 'Imágenes y vídeos', extensions: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS] },
  { name: 'Imágenes', extensions: [...IMAGE_EXTENSIONS] },
  { name: 'Vídeos', extensions: [...VIDEO_EXTENSIONS] }
]

export interface ImportOptions {
  /** Nombre a mostrar; por defecto el del archivo de origen. */
  originalName?: string
  /** Si es true, no se reutiliza un archivo con la misma huella. */
  allowDuplicate?: boolean
  derivedFrom?: string | null
  altText?: string
}

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
  private readonly processors: MediaProcessors
  private readonly tempDir: string

  constructor(
    private readonly repo: MediaRepository,
    private readonly mediaDir: string,
    private readonly pickFiles: FilePicker,
    options: { processors?: MediaProcessors; tempDir?: string } = {}
  ) {
    this.processors = options.processors ?? {
      probe: ffmpeg.probe,
      thumbnail: ffmpeg.thumbnail,
      toJpeg: ffmpeg.toJpeg
    }
    this.tempDir = options.tempDir ?? join(tmpdir(), 'rrss-planner')
  }

  list(): MediaAsset[] {
    return this.repo.list()
  }

  get(id: string): MediaAsset {
    return this.repo.get(id)
  }

  find(id: string): MediaAsset | null {
    return this.repo.find(id)
  }

  /** Abre el selector del sistema y copia cada archivo elegido a la carpeta de medios. */
  async import(): Promise<MediaAsset[]> {
    const paths = await this.pickFiles()
    const imported: MediaAsset[] = []
    for (const path of paths) imported.push(await this.importFile(path))
    return imported
  }

  async importFile(sourcePath: string, options: ImportOptions = {}): Promise<MediaAsset> {
    const ext = extname(sourcePath).slice(1).toLowerCase()
    const meta = MIME_BY_EXTENSION[ext]
    if (!meta) {
      throw new AppError('VALIDATION', `Formato no admitido: .${ext || '?'}`, { path: sourcePath })
    }

    const sha256 = await sha256OfFile(sourcePath)
    if (!options.allowDuplicate) {
      const existing = this.repo.findBySha(sha256)
      if (existing) {
        log.info(`Archivo ya importado, se reutiliza: ${existing.originalName}`)
        return existing
      }
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

    const asset = this.repo.create({
      id,
      fileName,
      originalName: options.originalName ?? basename(sourcePath),
      kind: meta.kind,
      mime: meta.mime,
      width,
      height,
      durationMs: null,
      sizeBytes: size,
      sha256,
      derivedFrom: options.derivedFrom ?? null,
      altText: options.altText
    })
    return meta.kind === 'video' ? this.analyzeVideo(asset) : asset
  }

  /** Lee duración, tamaño y audio con ffprobe y genera una miniatura. No falla la importación. */
  async analyzeVideo(asset: MediaAsset): Promise<MediaAsset> {
    const path = join(this.mediaDir, asset.fileName)
    try {
      const info = await this.processors.probe(path)
      let thumbFileName: string | null = asset.thumbUrl
        ? decodeURIComponent(asset.thumbUrl.split('/').pop() ?? '')
        : null
      try {
        const name = `${asset.id}.thumb.jpg`
        const at = info.durationMs ? Math.min(1, info.durationMs / 2000) : 0
        await this.processors.thumbnail(path, join(this.mediaDir, name), at)
        thumbFileName = name
      } catch (error) {
        log.warn(`Sin miniatura para ${asset.originalName}`, AppError.from(error).message)
      }
      return this.repo.update(asset.id, {
        width: info.width,
        height: info.height,
        durationMs: info.durationMs,
        thumbFileName,
        probe: { hasAudio: info.hasAudio, videoCodec: info.videoCodec, fps: info.fps }
      })
    } catch (error) {
      log.warn(`No se pudo analizar ${asset.originalName}`, AppError.from(error).message)
      return asset
    }
  }

  /** Vuelve a analizar un vídeo (o todos los que falten al arrancar). */
  async reprocess(id: string): Promise<MediaAsset> {
    const asset = this.repo.get(id)
    return asset.kind === 'video' ? this.analyzeVideo(asset) : asset
  }

  async processPending(): Promise<void> {
    for (const asset of this.repo.listUnprocessedVideos()) await this.analyzeVideo(asset)
  }

  /**
   * Devuelve una versión JPEG del archivo (la propia si ya lo es). La conversión se guarda
   * como medio derivado para no repetirla.
   */
  async ensureJpeg(asset: MediaAsset): Promise<MediaAsset> {
    if (asset.kind !== 'image') throw new AppError('VALIDATION', 'Solo se convierten imágenes.')
    if (asset.mime === 'image/jpeg') return asset
    const existing = this.repo.findDerived(asset.id, 'image/jpeg')
    if (existing) return existing
    await mkdir(this.tempDir, { recursive: true })
    const tmp = join(this.tempDir, `${asset.id}.jpg`)
    try {
      await this.processors.toJpeg(join(this.mediaDir, asset.fileName), tmp)
      const base = asset.originalName.replace(/\.[^.]+$/, '')
      const derived = await this.importFile(tmp, {
        originalName: `${base}.jpg`,
        allowDuplicate: true,
        derivedFrom: asset.id,
        altText: asset.altText
      })
      log.info(`Convertido a JPEG: ${asset.originalName} → ${derived.originalName}`)
      return derived
    } finally {
      await rm(tmp, { force: true }).catch(() => undefined)
    }
  }

  update(id: string, patch: { altText?: string }): MediaAsset {
    return this.repo.update(id, patch)
  }

  delete(id: string): void {
    this.repo.delete(id)
  }
}
