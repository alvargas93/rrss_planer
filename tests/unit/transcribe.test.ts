import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chunksToCues, type AsrChunk } from '@main/video/transcribe'
import { binaries, extractPcm16k, run } from '@main/video/ffmpeg'
import { VideoService } from '@main/services/video.service'
import type { VideoRepository } from '@main/repositories/video.repository'
import type { MediaService } from '@main/services/media.service'
import type { MediaAsset } from '@shared/domain/media'
import type { VideoProject, Cue } from '@shared/domain/video'

describe('chunksToCues (puro)', () => {
  it('un fragmento corto se convierte en un subtítulo con su tiempo', () => {
    const chunks: AsrChunk[] = [{ text: ' Hola a todos. ', timestamp: [0, 1.5] }]
    expect(chunksToCues(chunks)).toEqual([{ start: 0, end: 1.5, text: 'Hola a todos.' }])
  })

  it('desplaza los tiempos por el inicio del clip dentro del vídeo', () => {
    const cues = chunksToCues([{ text: 'Segunda parte', timestamp: [0.5, 2] }], 10)
    expect(cues[0]).toEqual({ start: 10.5, end: 12, text: 'Segunda parte' })
  })

  it('parte un fragmento largo en líneas legibles sin salirse de su tiempo', () => {
    const long =
      'Este fragmento es bastante más largo de lo que cabe en un solo subtítulo legible para el espectador'
    const cues = chunksToCues([{ text: long, timestamp: [0, 9] }])
    expect(cues.length).toBeGreaterThan(1)
    for (const c of cues) {
      expect(c.text.length).toBeLessThanOrEqual(42)
      expect(c.start).toBeGreaterThanOrEqual(0)
      expect(c.end).toBeLessThanOrEqual(9)
    }
    expect(cues.at(-1)?.end).toBe(9)
  })

  it('descarta fragmentos vacíos y repara tiempos sin final', () => {
    const cues = chunksToCues([
      { text: '   ', timestamp: [0, 1] },
      { text: 'Sin final', timestamp: [2, null] }
    ])
    expect(cues).toHaveLength(1)
    expect(cues[0]?.end).toBeGreaterThan(cues[0]!.start)
  })
})

describe('extracción de audio con FFmpeg real', () => {
  let dir: string
  let source: string

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rrss-asr-'))
    source = join(dir, 'tone.mp4')
    const { ffmpeg } = binaries()
    await run(
      ffmpeg,
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=3:size=160x120:rate=30',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=330:duration=3',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        source
      ],
      { timeoutMs: 60_000 }
    )
  }, 90_000)

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('devuelve audio mono de 16 kHz del tramo pedido', async () => {
    const pcm = await extractPcm16k(source, 1, 2.5)
    // 1,5 s a 16 kHz ≈ 24 000 muestras; se admite un pequeño margen de códec.
    expect(pcm.length).toBeGreaterThan(23_000)
    expect(pcm.length).toBeLessThan(25_000)
    const peak = Math.max(...Array.from(pcm.slice(0, 2000), Math.abs))
    expect(peak).toBeGreaterThan(0.05) // hay señal, no silencio
  }, 60_000)
})

describe('VideoService.transcribe con transcriptor simulado', () => {
  let dir: string
  let source: string

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rrss-tr-'))
    source = join(dir, 'clip.mp4')
    const { ffmpeg } = binaries()
    await run(
      ffmpeg,
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=2:size=160x120:rate=30',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=220:duration=2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        source
      ],
      { timeoutMs: 60_000 }
    )
  }, 90_000)

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('suma el desplazamiento de cada clip y no toca el vídeo', async () => {
    const asset: MediaAsset = {
      id: 'v1',
      fileName: 'clip.mp4',
      originalName: 'clip.mp4',
      kind: 'video',
      mime: 'video/mp4',
      width: 160,
      height: 120,
      durationMs: 2000,
      sizeBytes: 1,
      sha256: 'x',
      altText: '',
      derivedFrom: null,
      url: '',
      thumbUrl: null,
      probe: { hasAudio: true },
      createdAt: 'now',
      updatedAt: 'now'
    }
    const project: VideoProject = {
      id: 'p1',
      name: 'P',
      format: '9:16',
      fit: 'crop',
      lastExportMediaId: null,
      createdAt: 'now',
      updatedAt: 'now',
      timeline: {
        clips: [
          { mediaId: 'v1', startSec: 0, endSec: 1 },
          { mediaId: 'v1', startSec: 0.5, endSec: null }
        ],
        cues: [],
        subtitleStyle: { fontSize: 56, position: 'bottom', box: true }
      }
    }
    const seen: Array<{ samples: number; offset: number }> = []
    const service = new VideoService({
      repo: { get: () => project } as unknown as VideoRepository,
      media: { find: () => asset } as unknown as MediaService,
      mediaDir: dir,
      tempDir: dir,
      emit: () => undefined,
      transcribe: async (pcm, offsetSec): Promise<Cue[]> => {
        seen.push({ samples: pcm.length, offset: offsetSec })
        return [{ start: 0, end: 0.5, text: `tramo ${seen.length}` }]
      }
    })
    const cues = await service.transcribe('p1')
    // Clip 1: 1 s (offset 0); clip 2: 1,5 s desde 0,5 s (offset 1).
    expect(seen.map((s) => s.offset)).toEqual([0, 1])
    expect(seen[0]!.samples).toBeGreaterThan(15_000)
    expect(cues).toEqual([
      { start: 0, end: 0.5, text: 'tramo 1' },
      { start: 0, end: 0.5, text: 'tramo 2' }
    ])
  }, 60_000)
})
