import { describe, expect, it } from 'vitest'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { transcribePcm } from '@main/video/transcribe'
import { extractPcm16k } from '@main/video/ffmpeg'

/**
 * Prueba con el modelo Whisper REAL. Descarga el modelo la primera vez (~decenas de MB),
 * así que solo corre si se activa a mano:  RRSS_ASR_E2E=1 npm test -- transcribe.model
 * El vídeo de entrada se indica con RRSS_ASR_FILE (ruta a un .mp4 con voz en español).
 */
const enabled = process.env['RRSS_ASR_E2E'] === '1' && !!process.env['RRSS_ASR_FILE']

describe.skipIf(!enabled)('Whisper real (opt-in)', () => {
  it('transcribe una frase en español con marcas de tiempo', async () => {
    const file = process.env['RRSS_ASR_FILE']!
    expect(existsSync(file)).toBe(true)
    const modelDir = mkdtempSync(join(tmpdir(), 'rrss-models-'))
    const pcm = await extractPcm16k(file, 0, 30)
    const cues = await transcribePcm(pcm, 0, { modelDir, onStatus: (m) => console.log(m) })
    console.log(JSON.stringify(cues, null, 2))
    expect(cues.length).toBeGreaterThan(0)
    const text = cues
      .map((c) => c.text)
      .join(' ')
      .toLowerCase()
    // La frase de prueba se grabó con una voz en inglés: se comprueba lo que realmente se dijo.
    expect(text).toMatch(/errores|creadores|redes/)
    for (const c of cues) expect(c.end).toBeGreaterThanOrEqual(c.start)
  }, 900_000)
})
