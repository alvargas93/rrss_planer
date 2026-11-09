import {
  FORMAT_SIZE,
  type Cue,
  type Fit,
  type SubtitleStyle,
  type VideoFormat
} from '@shared/domain/video'

/**
 * Construcción pura de los argumentos de FFmpeg y del fichero de subtítulos.
 * Sin tocar disco ni procesos: se prueba con tests unitarios.
 */

export interface PlanClip {
  path: string
  startSec: number
  /** Segundos de fin ya resueltos (nunca null). */
  endSec: number
  hasAudio: boolean
}

export interface ExportPlanInput {
  clips: PlanClip[]
  format: VideoFormat
  fit: Fit
  /** Ruta del .ass ya escrito, o null si no hay subtítulos. */
  subtitlesPath: string | null
  outputPath: string
  fps?: number
}

export interface ExportPlan {
  args: string[]
  totalDurationSec: number
}

/** FFmpeg exige escapar ':' y '\' en rutas dentro de filtros; usamos barras normales. */
export function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

function fitChain(fit: Fit, w: number, h: number, inLabel: string, outLabel: string): string {
  switch (fit) {
    case 'crop':
      return `${inLabel}scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1${outLabel}`
    case 'black':
      return `${inLabel}scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1${outLabel}`
    case 'blur': {
      const bg = `${inLabel.replace('[', '[').replace(']', '')}`
      // split → fondo ampliado y desenfocado + primer plano encajado, superpuestos.
      return (
        `${inLabel}split[${bg}bg][${bg}fg];` +
        `[${bg}bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=24:4[${bg}bgb];` +
        `[${bg}fg]scale=${w}:${h}:force_original_aspect_ratio=decrease[${bg}fgs];` +
        `[${bg}bgb][${bg}fgs]overlay=(W-w)/2:(H-h)/2,setsar=1${outLabel}`
      )
    }
  }
}

export function buildExportPlan(input: ExportPlanInput): ExportPlan {
  const { width, height } = FORMAT_SIZE[input.format]
  const fps = input.fps ?? 30
  const args: string[] = ['-y', '-hide_banner', '-nostats', '-progress', 'pipe:1']
  const filters: string[] = []
  const concatInputs: string[] = []
  let total = 0

  input.clips.forEach((clip) => {
    const dur = Math.max(0.1, clip.endSec - clip.startSec)
    total += dur
    args.push('-ss', clip.startSec.toFixed(3), '-t', dur.toFixed(3), '-i', clip.path)
  })
  // Fuente de silencio para clips sin audio (una sola, se recorta por clip).
  const silenceIndex = input.clips.length
  const needsSilence = input.clips.some((c) => !c.hasAudio)
  if (needsSilence)
    args.push(
      '-f',
      'lavfi',
      '-t',
      total.toFixed(3),
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=48000'
    )

  input.clips.forEach((clip, i) => {
    const dur = Math.max(0.1, clip.endSec - clip.startSec)
    filters.push(`[${i}:v]setpts=PTS-STARTPTS,fps=${fps},format=yuv420p[v${i}raw]`)
    filters.push(fitChain(input.fit, width, height, `[v${i}raw]`, `[v${i}]`))
    if (clip.hasAudio) {
      filters.push(
        `[${i}:a]asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo[a${i}]`
      )
    } else {
      filters.push(`[${silenceIndex}:a]atrim=0:${dur.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`)
    }
    concatInputs.push(`[v${i}][a${i}]`)
  })

  filters.push(`${concatInputs.join('')}concat=n=${input.clips.length}:v=1:a=1[vcat][aout]`)
  if (input.subtitlesPath) {
    filters.push(`[vcat]subtitles='${escapeFilterPath(input.subtitlesPath)}'[vout]`)
  } else {
    filters.push(`[vcat]null[vout]`)
  }

  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    input.outputPath
  )
  return { args, totalDurationSec: total }
}

/** h:mm:ss.cc, el formato de tiempo de ASS. */
export function assTime(sec: number): string {
  const s = Math.max(0, sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = s % 60
  const whole = Math.floor(rest)
  const cs = Math.round((rest - whole) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(Math.min(cs, 99)).padStart(2, '0')}`
}

function assEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\r?\n/g, '\\N')
}

/** Fichero ASS con un estilo legible: fuente grande, borde y caja semitransparente. */
export function buildAss(cues: Cue[], style: SubtitleStyle, format: VideoFormat): string {
  const { width, height } = FORMAT_SIZE[format]
  const alignment = style.position === 'top' ? 8 : style.position === 'center' ? 5 : 2
  const marginV = Math.round(height * 0.08)
  const borderStyle = style.box ? 3 : 1
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,Arial,${style.fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,${borderStyle},3,0,${alignment},${Math.round(width * 0.06)},${Math.round(width * 0.06)},${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ]
  const events = cues
    .filter((c) => c.text.trim() && c.end > c.start)
    .map(
      (c) =>
        `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${assEscape(c.text.trim())}`
    )
  return [...header, ...events, ''].join('\n')
}

/** Reparte un guion en subtítulos de longitud legible a lo largo de una duración. Pura. */
export function splitScriptIntoCues(script: string, totalSec: number, maxChars = 42): Cue[] {
  const words = script.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length === 0 || totalSec <= 0) return []
  const chunks: string[] = []
  let current = ''
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars && current) {
      chunks.push(current.trim())
      current = word
    } else {
      current = `${current} ${word}`.trim()
    }
  }
  if (current) chunks.push(current.trim())
  const totalChars = chunks.reduce((a, c) => a + c.length, 0)
  let cursor = 0
  return chunks.map((text) => {
    const dur = (text.length / totalChars) * totalSec
    const cue = {
      start: Number(cursor.toFixed(2)),
      end: Number(Math.min(totalSec, cursor + dur).toFixed(2)),
      text
    }
    cursor += dur
    return cue
  })
}
