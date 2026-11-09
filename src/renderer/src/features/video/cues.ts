import type { Cue } from '@shared/domain/video'

/** Reparte un guion en subtítulos legibles a lo largo de la duración (sin IA). */
export function splitScriptIntoCuesClient(script: string, totalSec: number, maxChars = 42): Cue[] {
  const words = script.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length === 0 || totalSec <= 0) return []
  const chunks: string[] = []
  let current = ''
  for (const word of words) {
    if (`${current} ${word}`.trim().length > maxChars && current) {
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
