import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MediaAsset } from '@shared/domain/media'
import { clipDuration, type ExportProgress, type VideoProject } from '@shared/domain/video'
import { AppError } from '@shared/domain/errors'
import type { VideoRepository } from '../repositories/video.repository'
import type { MediaService } from './media.service'
import { buildAss, buildExportPlan, type PlanClip } from '../video/graph'
import { exportVideo, extractPcm16k, probe } from '../video/ffmpeg'
import type { Cue } from '@shared/domain/video'
import { newId } from '../db/helpers'
import { createLogger } from '../log'

const log = createLogger('video')

export interface VideoServiceDeps {
  repo: VideoRepository
  media: MediaService
  mediaDir: string
  tempDir: string
  emit: (progress: ExportProgress) => void
  /** Inyectable para tests: por defecto, el exportador real de FFmpeg. */
  runExport?: typeof exportVideo
  /** Transcribe audio 16 kHz y devuelve subtítulos desplazados al inicio indicado. */
  transcribe?: (pcm: Float32Array, offsetSec: number) => Promise<Cue[]>
}

/** Proyectos de vídeo y exportación con FFmpeg. */
export class VideoService {
  private exporting = new Set<string>()

  constructor(private readonly deps: VideoServiceDeps) {}

  list(): VideoProject[] {
    return this.deps.repo.list()
  }

  get(id: string): VideoProject {
    return this.deps.repo.get(id)
  }

  create(input: Parameters<VideoRepository['create']>[0]): VideoProject {
    return this.deps.repo.create(input)
  }

  update(id: string, patch: Parameters<VideoRepository['update']>[1]): VideoProject {
    return this.deps.repo.update(id, patch)
  }

  delete(id: string): void {
    this.deps.repo.delete(id)
  }

  /** Duración total del proyecto con los recortes aplicados. */
  duration(project: VideoProject): number {
    return project.timeline.clips.reduce((total, clip) => {
      const asset = this.deps.media.find(clip.mediaId)
      const mediaSec = asset?.durationMs ? asset.durationMs / 1000 : 0
      return total + clipDuration(clip, mediaSec)
    }, 0)
  }

  /**
   * Transcribe el audio de los clips en el orden de la línea de tiempo. Cada clip se
   * recorta igual que en la exportación, así que los tiempos de los subtítulos casan
   * con el vídeo final. Todo ocurre en el equipo.
   */
  async transcribe(projectId: string): Promise<Cue[]> {
    if (!this.deps.transcribe)
      throw new AppError('NOT_CONFIGURED', 'La transcripción no está disponible en este entorno.')
    const project = this.deps.repo.get(projectId)
    if (project.timeline.clips.length === 0)
      throw new AppError('VALIDATION', 'Añade al menos un clip para transcribir su audio.')
    const cues: Cue[] = []
    let offset = 0
    for (const clip of project.timeline.clips) {
      const asset = this.deps.media.find(clip.mediaId)
      if (!asset || asset.kind !== 'video')
        throw new AppError('NOT_FOUND', 'Uno de los clips ya no está en la biblioteca.')
      const path = join(this.deps.mediaDir, asset.fileName)
      const info = await probe(path)
      if (!info.hasAudio)
        throw new AppError('VALIDATION', `"${asset.originalName}" no tiene audio que transcribir.`)
      const mediaSec = asset.durationMs ? asset.durationMs / 1000 : (info.durationMs ?? 0) / 1000
      const endSec = clip.endSec === null ? mediaSec : Math.min(clip.endSec, mediaSec)
      const length = Math.max(0, endSec - clip.startSec)
      const pcm = await extractPcm16k(path, clip.startSec, endSec)
      cues.push(...(await this.deps.transcribe(pcm, offset)))
      offset += length
    }
    return cues
  }

  /**
   * Exporta el proyecto a un MP4 (H.264 + AAC, moov al principio) y lo añade a la
   * biblioteca de medios. El progreso llega por el evento video:progress.
   */
  async export(projectId: string): Promise<MediaAsset> {
    if (this.exporting.has(projectId))
      throw new AppError('CONFLICT', 'Este proyecto ya se está exportando.')
    const project = this.deps.repo.get(projectId)
    if (project.timeline.clips.length === 0)
      throw new AppError('VALIDATION', 'Añade al menos un clip antes de exportar.')

    const clips: PlanClip[] = []
    for (const clip of project.timeline.clips) {
      const asset = this.deps.media.find(clip.mediaId)
      if (!asset || asset.kind !== 'video')
        throw new AppError('NOT_FOUND', 'Uno de los clips ya no está en la biblioteca.')
      const mediaSec = asset.durationMs ? asset.durationMs / 1000 : null
      if (mediaSec === null)
        throw new AppError(
          'VALIDATION',
          `No se conoce la duración de "${asset.originalName}". Vuelve a importarlo.`
        )
      const endSec = clip.endSec === null ? mediaSec : Math.min(clip.endSec, mediaSec)
      if (endSec - clip.startSec < 0.1)
        throw new AppError(
          'VALIDATION',
          `El recorte de "${asset.originalName}" deja menos de 0,1 s.`
        )
      const probe = asset.probe as { hasAudio?: boolean }
      clips.push({
        path: join(this.deps.mediaDir, asset.fileName),
        startSec: clip.startSec,
        endSec,
        hasAudio: probe.hasAudio !== false
      })
    }

    this.exporting.add(projectId)
    const emit = (
      percent: number | null,
      message: string,
      done = false,
      error: string | null = null
    ): void => this.deps.emit({ projectId, percent, message, done, error })
    const workDir = join(this.deps.tempDir, `export-${newId()}`)
    try {
      await mkdir(workDir, { recursive: true })
      let subtitlesPath: string | null = null
      if (project.timeline.cues.length > 0) {
        subtitlesPath = join(workDir, 'subs.ass')
        await writeFile(
          subtitlesPath,
          buildAss(project.timeline.cues, project.timeline.subtitleStyle, project.format),
          'utf8'
        )
      }
      const outputPath = join(workDir, 'export.mp4')
      const plan = buildExportPlan({
        clips,
        format: project.format,
        fit: project.fit,
        subtitlesPath,
        outputPath
      })
      emit(0, 'Exportando…')
      log.info(
        `Exportando proyecto ${project.name} (${clips.length} clips, ${plan.totalDurationSec.toFixed(1)} s)`
      )
      await (this.deps.runExport ?? exportVideo)({
        args: plan.args,
        totalDurationSec: plan.totalDurationSec,
        onProgress: (percent) =>
          emit(percent, percent >= 100 ? 'Guardando en la biblioteca…' : 'Exportando…')
      })
      const safeName = project.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'video'
      const asset = await this.deps.media.importFile(outputPath, {
        originalName: `${safeName} ${project.format.replace(':', 'x')}.mp4`,
        allowDuplicate: true
      })
      this.deps.repo.update(projectId, { lastExportMediaId: asset.id })
      emit(100, 'Exportación terminada', true)
      return asset
    } catch (error) {
      const appError = AppError.from(error)
      emit(null, 'Error al exportar', true, appError.message)
      throw appError
    } finally {
      this.exporting.delete(projectId)
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
