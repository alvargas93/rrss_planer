import { env, pipeline } from '@huggingface/transformers'
import type { Cue } from '@shared/domain/video'
import { AppError } from '@shared/domain/errors'
import { splitScriptIntoCues } from './graph'
import { createLogger } from '../log'

const log = createLogger('transcribe')

/**
 * Transcripción 100 % local con Whisper (modelo abierto, ejecutado con ONNX Runtime).
 * El modelo se descarga una vez desde Hugging Face a la carpeta de datos de la app y
 * a partir de ahí funciona sin conexión. El audio nunca sale del equipo.
 */
export const WHISPER_MODEL = 'Xenova/whisper-base'
export const SAMPLE_RATE = 16_000

export interface AsrChunk {
  text: string
  timestamp: [number, number | null]
}

const MAX_CUE_SECONDS = 4
const MAX_CUE_CHARS = 42

/**
 * Convierte los fragmentos con marca de tiempo de Whisper en subtítulos legibles.
 * Un fragmento largo se parte en varios repartiendo su tiempo por longitud de texto.
 * Pura: se prueba sin modelo.
 */
export function chunksToCues(chunks: AsrChunk[], offsetSec = 0): Cue[] {
  const cues: Cue[] = []
  for (const chunk of chunks) {
    const text = chunk.text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const start = chunk.timestamp[0] ?? 0
    const end = Math.max(start + 0.5, chunk.timestamp[1] ?? start + text.length * 0.07)
    const duration = end - start
    if (text.length <= MAX_CUE_CHARS && duration <= MAX_CUE_SECONDS) {
      cues.push({ start: round(start + offsetSec), end: round(end + offsetSec), text })
      continue
    }
    for (const part of splitScriptIntoCues(text, duration, MAX_CUE_CHARS)) {
      cues.push({
        start: round(start + part.start + offsetSec),
        end: round(start + part.end + offsetSec),
        text: part.text
      })
    }
  }
  return cues
}

const round = (n: number): number => Math.round(n * 100) / 100

/** Idioma por defecto del audio a transcribir (nombre en inglés, como lo espera Whisper). */
export const DEFAULT_LANGUAGE = 'spanish'

export interface TranscriberOptions {
  /** Carpeta donde se guarda el modelo descargado. */
  modelDir: string
  /** Idioma del audio; por defecto español. */
  language?: string
  /** Avisos de descarga y carga para la interfaz. */
  onStatus?: (message: string) => void
}

type Asr = (
  audio: Float32Array,
  options: Record<string, unknown>
) => Promise<{ text: string; chunks?: AsrChunk[] }>

let loaded: Asr | null = null
let loading: Promise<Asr> | null = null

/** Carga el modelo una sola vez por proceso. Si falla, se puede reintentar. */
export function loadWhisper(options: TranscriberOptions): Promise<Asr> {
  if (loaded) return Promise.resolve(loaded)
  if (loading) return loading
  env.cacheDir = options.modelDir
  options.onStatus?.('Preparando el reconocimiento de voz…')
  loading = (
    pipeline('automatic-speech-recognition', WHISPER_MODEL, {
      dtype: 'q8',
      progress_callback: (p: { status?: string; file?: string; progress?: number }) => {
        if (p.status === 'progress' && p.file && typeof p.progress === 'number') {
          options.onStatus?.(
            `Descargando el modelo de voz (solo la primera vez): ${Math.round(p.progress)} %`
          )
        }
      }
    }) as unknown as Promise<Asr>
  )
    .then((asr) => {
      loaded = asr
      log.info(`Modelo ${WHISPER_MODEL} listo`)
      return asr
    })
    .catch((error: unknown) => {
      loading = null
      log.warn('No se pudo cargar el modelo de voz', error instanceof Error ? error.message : error)
      throw new AppError(
        'EXTERNAL_API',
        'No se pudo cargar el modelo de voz. Si es la primera vez, comprueba tu conexión (se descarga una vez) y vuelve a intentarlo.'
      )
    })
  return loading
}

/** Transcribe audio mono 16 kHz y devuelve subtítulos desplazados `offsetSec`. */
export async function transcribePcm(
  pcm: Float32Array,
  offsetSec: number,
  options: TranscriberOptions
): Promise<Cue[]> {
  if (pcm.length < SAMPLE_RATE / 10) return []
  const asr = await loadWhisper(options)
  // Sin idioma explícito, Whisper transcribe en inglés aunque el audio sea español.
  const result = await asr(pcm, {
    language: options.language ?? DEFAULT_LANGUAGE,
    task: 'transcribe',
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5
  })
  const chunks: AsrChunk[] =
    result.chunks && result.chunks.length > 0
      ? result.chunks
      : [{ text: result.text, timestamp: [0, pcm.length / SAMPLE_RATE] }]
  return chunksToCues(chunks, offsetSec)
}
