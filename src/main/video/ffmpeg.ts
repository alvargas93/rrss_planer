import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import { AppError } from '@shared/domain/errors'
import { createLogger } from '../log'

const log = createLogger('ffmpeg')

/** Dentro del paquete, los binarios viven fuera del asar (electron-builder asarUnpack). */
function unpacked(path: string): string {
  return path.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
}

export function binaries(): { ffmpeg: string; ffprobe: string } {
  const ffmpeg = unpacked(String(ffmpegPath ?? ''))
  const ffprobe = unpacked(ffprobeStatic.path)
  if (!ffmpeg || !existsSync(ffmpeg)) throw new AppError('IO', `No se encontró FFmpeg en ${ffmpeg}`)
  if (!existsSync(ffprobe)) throw new AppError('IO', `No se encontró ffprobe en ${ffprobe}`)
  return { ffmpeg, ffprobe }
}

export interface ProbeResult {
  durationMs: number | null
  width: number | null
  height: number | null
  hasAudio: boolean
  hasVideo: boolean
  videoCodec: string | null
  fps: number | null
}

interface RunOptions {
  /** Recibe cada línea de stdout (p. ej. -progress pipe:1). */
  onStdoutLine?: (line: string) => void
  timeoutMs?: number
}

/** Ejecuta un binario y devuelve stdout; falla con las últimas líneas de stderr. */
export function run(bin: string, args: string[], options: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    let stdout = ''
    let stderrTail = ''
    let pending = ''
    const timer = options.timeoutMs ? setTimeout(() => child.kill(), options.timeoutMs) : null
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      if (options.onStdoutLine) {
        pending += text
        const lines = pending.split(/\r?\n/)
        pending = lines.pop() ?? ''
        for (const line of lines) options.onStdoutLine(line)
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000)
    })
    child.on('error', (error) => {
      if (timer) clearTimeout(timer)
      reject(new AppError('IO', `No se pudo ejecutar ${bin}: ${error.message}`))
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else {
        const detail = stderrTail.trim().split('\n').slice(-6).join('\n')
        log.warn(`${bin} terminó con código ${code}`, detail)
        reject(
          new AppError('IO', `FFmpeg falló (código ${code}): ${detail.split('\n').pop() ?? ''}`, {
            detail
          })
        )
      }
    })
  })
}

export async function probe(filePath: string): Promise<ProbeResult> {
  const { ffprobe } = binaries()
  const out = await run(
    ffprobe,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath],
    { timeoutMs: 30_000 }
  )
  const json = JSON.parse(out) as {
    format?: { duration?: string }
    streams?: Array<{
      codec_type?: string
      codec_name?: string
      width?: number
      height?: number
      duration?: string
      r_frame_rate?: string
      tags?: { rotate?: string }
    }>
  }
  const video = json.streams?.find((s) => s.codec_type === 'video')
  const audio = json.streams?.find((s) => s.codec_type === 'audio')
  const durationSec = Number(json.format?.duration ?? video?.duration ?? NaN)
  let width = video?.width ?? null
  let height = video?.height ?? null
  // Vídeos de móvil girados: la rotación va en metadatos.
  const rotate = Number(video?.tags?.rotate ?? 0)
  if ((rotate === 90 || rotate === 270) && width && height) [width, height] = [height, width]
  let fps: number | null = null
  if (video?.r_frame_rate) {
    const [n, d] = video.r_frame_rate.split('/').map(Number)
    if (n && d) fps = Math.round((n / d) * 100) / 100
  }
  return {
    durationMs: Number.isFinite(durationSec) ? Math.round(durationSec * 1000) : null,
    width,
    height,
    hasAudio: !!audio,
    hasVideo: !!video,
    videoCodec: video?.codec_name ?? null,
    fps
  }
}

/** Fotograma JPEG del segundo indicado, reducido a 640 px de ancho. */
export async function thumbnail(input: string, output: string, atSec = 0.5): Promise<void> {
  const { ffmpeg } = binaries()
  await run(
    ffmpeg,
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      String(atSec),
      '-i',
      input,
      '-frames:v',
      '1',
      '-vf',
      'scale=640:-2',
      '-q:v',
      '4',
      output
    ],
    { timeoutMs: 60_000 }
  )
}

/**
 * Convierte cualquier imagen a JPEG sRGB sobre fondo blanco (las redes no admiten
 * transparencia) y, si es muy ancha, la reduce a 1440 px.
 */
export async function toJpeg(input: string, output: string): Promise<void> {
  const { ffmpeg } = binaries()
  await run(
    ffmpeg,
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      input,
      '-filter_complex',
      "[0:v]format=rgba,scale='min(1440,iw)':-2[fg];color=white:s=16x16[c];[c][fg]scale2ref[bg][fgs];[bg][fgs]overlay=format=auto,format=yuvj420p[out]",
      '-map',
      '[out]',
      '-frames:v',
      '1',
      '-q:v',
      '2',
      output
    ],
    { timeoutMs: 60_000 }
  )
}

export interface ExportRun {
  args: string[]
  totalDurationSec: number
  onProgress: (percent: number) => void
}

/** Ejecuta una exportación con `-progress pipe:1` y traduce el avance a porcentaje. */
export async function exportVideo(input: ExportRun): Promise<void> {
  const { ffmpeg } = binaries()
  await run(ffmpeg, input.args, {
    onStdoutLine: (line) => {
      const match = /^out_time_(?:us|ms)=(\d+)/.exec(line)
      if (match && input.totalDurationSec > 0) {
        const micros = Number(match[1])
        const percent = Math.min(
          99,
          Math.round((micros / 1_000_000 / input.totalDurationSec) * 100)
        )
        input.onProgress(percent)
      }
      if (line.startsWith('progress=end')) input.onProgress(100)
    },
    timeoutMs: 30 * 60_000
  })
}

/** Ejecuta un binario y devuelve su salida binaria completa (p. ej. audio en bruto). */
export function runBinary(bin: string, args: string[], timeoutMs = 10 * 60_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    const chunks: Buffer[] = []
    let stderrTail = ''
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new AppError('IO', `No se pudo ejecutar ${bin}: ${error.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(Buffer.concat(chunks))
      else
        reject(
          new AppError(
            'IO',
            `FFmpeg no pudo extraer el audio (código ${code}): ${stderrTail.trim().split('\n').pop() ?? ''}`
          )
        )
    })
  })
}

/**
 * Audio mono de 16 kHz (lo que espera Whisper) de un tramo de un archivo, como Float32Array.
 * Si el archivo no tiene pista de audio, FFmpeg falla y el error se traduce arriba.
 */
export async function extractPcm16k(
  input: string,
  startSec: number,
  endSec: number
): Promise<Float32Array> {
  const { ffmpeg } = binaries()
  const duration = Math.max(0.1, endSec - startSec)
  const buf = await runBinary(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    startSec.toFixed(3),
    '-t',
    duration.toFixed(3),
    '-i',
    input,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-f',
    'f32le',
    'pipe:1'
  ])
  // Copia a un ArrayBuffer propio para garantizar alineación de 4 bytes.
  return new Float32Array(new Uint8Array(buf).buffer)
}
