import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clipDuration, fmtSeconds } from '@shared/domain/video'
import {
  assTime,
  buildAss,
  buildExportPlan,
  escapeFilterPath,
  splitScriptIntoCues
} from '@main/video/graph'
import { binaries, exportVideo, probe, run, thumbnail, toJpeg } from '@main/video/ffmpeg'

describe('funciones puras de vídeo', () => {
  it('duración de un clip con y sin fin', () => {
    expect(clipDuration({ mediaId: 'a', startSec: 2, endSec: null }, 10)).toBe(8)
    expect(clipDuration({ mediaId: 'a', startSec: 2, endSec: 5 }, 10)).toBe(3)
    expect(clipDuration({ mediaId: 'a', startSec: 2, endSec: 50 }, 10)).toBe(8)
    expect(fmtSeconds(65.25)).toBe('1:05.3')
  })

  it('tiempos ASS y escapado de rutas para filtros', () => {
    expect(assTime(0)).toBe('0:00:00.00')
    expect(assTime(61.5)).toBe('0:01:01.50')
    expect(assTime(3725.126)).toBe('1:02:05.13')
    expect(escapeFilterPath('C:\\tmp\\subs.ass')).toBe('C\\:/tmp/subs.ass')
  })

  it('el ASS lleva estilo, resolución y una línea por subtítulo', () => {
    const ass = buildAss(
      [
        { start: 0, end: 2, text: 'Hola {mundo}' },
        { start: 2, end: 1, text: 'inválido' },
        { start: 2, end: 4, text: '' }
      ],
      { fontSize: 60, position: 'center', box: true },
      '9:16'
    )
    expect(ass).toContain('PlayResX: 1080')
    expect(ass).toContain('PlayResY: 1920')
    expect(ass).toContain('Style: Default,Arial,60,')
    expect(ass.match(/^Dialogue:/gm)).toHaveLength(1)
    expect(ass).toContain('Hola (mundo)')
  })

  it('el plan de exportación recorta, encaja, concatena y añade silencio si falta audio', () => {
    const plan = buildExportPlan({
      clips: [
        { path: 'a.mp4', startSec: 1, endSec: 3, hasAudio: true },
        { path: 'b.mp4', startSec: 0, endSec: 2.5, hasAudio: false }
      ],
      format: '1:1',
      fit: 'blur',
      subtitlesPath: 'C:\\tmp\\s.ass',
      outputPath: 'out.mp4'
    })
    expect(plan.totalDurationSec).toBeCloseTo(4.5)
    const args = plan.args.join(' ')
    expect(args).toContain('-ss 1.000 -t 2.000 -i a.mp4')
    expect(args).toContain('anullsrc')
    expect(args).toContain('concat=n=2:v=1:a=1')
    expect(args).toContain('boxblur')
    expect(args).toContain("subtitles='C\\:/tmp/s.ass'")
    expect(args).toContain('-movflags +faststart')
    expect(args).toContain('scale=1080:1080')
  })

  it('reparte un guion en subtítulos cortos que cubren la duración', () => {
    const cues = splitScriptIntoCues(
      'Si estás empezando evita estos tres errores que casi nadie te cuenta el primer día',
      10
    )
    expect(cues.length).toBeGreaterThan(1)
    for (const c of cues) expect(c.text.length).toBeLessThanOrEqual(42)
    expect(cues[0]?.start).toBe(0)
    expect(cues.at(-1)?.end).toBe(10)
  })
})

describe('FFmpeg real con un vídeo sintético', () => {
  let dir: string
  let source: string

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rrss-video-'))
    source = join(dir, 'src.mp4')
    const { ffmpeg } = binaries()
    // 2 s de patrón de prueba 320x240 con tono de audio.
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
        'testsrc=duration=2:size=320x240:rate=30',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=2',
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

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('ffprobe lee duración, tamaño y audio', async () => {
    const info = await probe(source)
    expect(info.durationMs).toBeGreaterThan(1800)
    expect(info.width).toBe(320)
    expect(info.height).toBe(240)
    expect(info.hasAudio).toBe(true)
    expect(info.videoCodec).toBe('h264')
  })

  it('genera una miniatura JPEG y convierte PNG a JPEG', async () => {
    const thumb = join(dir, 'thumb.jpg')
    await thumbnail(source, thumb, 0.5)
    expect(existsSync(thumb)).toBe(true)
    const png = join(dir, 'frame.png')
    const { ffmpeg } = binaries()
    await run(ffmpeg, [
      '-y',
      '-loglevel',
      'error',
      '-i',
      source,
      '-frames:v',
      '1',
      '-vf',
      'format=rgba',
      png
    ])
    const jpg = join(dir, 'frame.jpg')
    await toJpeg(png, jpg)
    const info = await probe(jpg)
    expect(info.videoCodec).toBe('mjpeg')
    expect(info.width).toBe(320)
  }, 60_000)

  it('exporta dos recortes concatenados a 1:1 con subtítulos y reporta progreso', async () => {
    const subs = join(dir, 'subs.ass')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(
      subs,
      buildAss(
        [{ start: 0, end: 1.5, text: 'Hola' }],
        { fontSize: 48, position: 'bottom', box: true },
        '1:1'
      )
    )
    const output = join(dir, 'out.mp4')
    const plan = buildExportPlan({
      clips: [
        { path: source, startSec: 0, endSec: 1, hasAudio: true },
        { path: source, startSec: 1, endSec: 2, hasAudio: false }
      ],
      format: '1:1',
      fit: 'black',
      subtitlesPath: subs,
      outputPath: output
    })
    const percents: number[] = []
    await exportVideo({ ...plan, onProgress: (p) => percents.push(p) })
    const info = await probe(output)
    expect(info.width).toBe(1080)
    expect(info.height).toBe(1080)
    expect(info.hasAudio).toBe(true)
    expect(info.durationMs).toBeGreaterThan(1800)
    expect(info.durationMs).toBeLessThan(2300)
    expect(percents.at(-1)).toBe(100)
  }, 120_000)
})
