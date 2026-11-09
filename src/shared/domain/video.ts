import { z } from 'zod'
import { EntityBase, IdSchema } from './common'

export const VIDEO_FORMATS = ['9:16', '1:1', '16:9'] as const
export const VideoFormatSchema = z.enum(VIDEO_FORMATS)
export type VideoFormat = z.infer<typeof VideoFormatSchema>

/** Resolución de salida por formato (lado mayor 1920 / 1080, como recomiendan las redes). */
export const FORMAT_SIZE: Record<VideoFormat, { width: number; height: number; label: string }> = {
  '9:16': { width: 1080, height: 1920, label: 'Vertical · reels, shorts e historias' },
  '1:1': { width: 1080, height: 1080, label: 'Cuadrado · feed' },
  '16:9': { width: 1920, height: 1080, label: 'Horizontal · YouTube y LinkedIn' }
}

/** Cómo encajar un clip que no tiene la proporción de salida. */
export const FitSchema = z.enum(['crop', 'blur', 'black'])
export type Fit = z.infer<typeof FitSchema>
export const FIT_LABELS: Record<Fit, string> = {
  crop: 'Recortar (rellena el encuadre)',
  blur: 'Fondo desenfocado',
  black: 'Bandas negras'
}

export const ClipSchema = z.object({
  mediaId: IdSchema,
  /** Segundo de inicio dentro del archivo original. */
  startSec: z.number().min(0).default(0),
  /** Segundo de fin; null = hasta el final. */
  endSec: z.number().min(0).nullable().default(null)
})
export type Clip = z.infer<typeof ClipSchema>

export const CueSchema = z.object({
  /** Segundos desde el inicio del vídeo exportado. */
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string().max(200)
})
export type Cue = z.infer<typeof CueSchema>

export const SubtitleStyleSchema = z.object({
  fontSize: z.number().int().min(24).max(120).default(56),
  position: z.enum(['bottom', 'center', 'top']).default('bottom'),
  /** Fondo semitransparente detrás del texto para que se lea sobre cualquier imagen. */
  box: z.boolean().default(true)
})
export type SubtitleStyle = z.infer<typeof SubtitleStyleSchema>

export const TimelineSchema = z.object({
  clips: z.array(ClipSchema).default([]),
  cues: z.array(CueSchema).default([]),
  subtitleStyle: SubtitleStyleSchema.default(() => SubtitleStyleSchema.parse({}))
})
export type Timeline = z.infer<typeof TimelineSchema>

export const VideoProjectSchema = z.object({
  ...EntityBase,
  name: z.string(),
  format: VideoFormatSchema,
  fit: FitSchema,
  timeline: TimelineSchema,
  lastExportMediaId: IdSchema.nullable()
})
export type VideoProject = z.infer<typeof VideoProjectSchema>

export const VideoProjectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120).default('Nuevo vídeo'),
  format: VideoFormatSchema.default('9:16'),
  fit: FitSchema.default('crop'),
  timeline: TimelineSchema.default(() => TimelineSchema.parse({}))
})
export const VideoProjectUpdateSchema = z.object({
  id: IdSchema,
  patch: VideoProjectCreateSchema.partial()
})

export const ExportProgressSchema = z.object({
  projectId: IdSchema,
  /** 0–100; null mientras se prepara. */
  percent: z.number().min(0).max(100).nullable(),
  message: z.string(),
  done: z.boolean(),
  error: z.string().nullable()
})
export type ExportProgress = z.infer<typeof ExportProgressSchema>

/** Duración efectiva de un clip dado su archivo. Pura (probada). */
export function clipDuration(clip: Clip, mediaDurationSec: number): number {
  const end = clip.endSec === null ? mediaDurationSec : Math.min(clip.endSec, mediaDurationSec)
  return Math.max(0, end - clip.startSec)
}

/** Formato de tiempo mm:ss.d para la interfaz. */
export function fmtSeconds(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}
