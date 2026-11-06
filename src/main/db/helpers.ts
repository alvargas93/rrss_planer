import { uuidv7 } from 'uuidv7'

/** Identificador nuevo: UUID v7 (ordenable por tiempo, apto para sincronizar en la v2). */
export function newId(): string {
  return uuidv7()
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function parseJsonArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function parseJsonRecord(value: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') out[k] = v
    return out
  } catch {
    return {}
  }
}
