import { AiStreamEventSchema } from '../domain/ai'

/**
 * Eventos que el proceso principal EMPUJA a la interfaz (sin que esta pregunte).
 * El preload solo deja suscribirse a los canales de esta lista.
 */
export const eventContracts = {
  'ai:stream': AiStreamEventSchema
} as const

export type EventName = keyof typeof eventContracts
export type EventPayload<K extends EventName> = (typeof eventContracts)[K]['_output']

export function isEventName(value: unknown): value is EventName {
  return typeof value === 'string' && value in eventContracts
}
