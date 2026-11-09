import { z } from 'zod'
import { AiStreamEventSchema } from '../domain/ai'
import { IdSchema } from '../domain/common'
import { ExportProgressSchema } from '../domain/video'

/**
 * Eventos que el proceso principal EMPUJA a la interfaz (sin que esta pregunte).
 * El preload solo deja suscribirse a los canales de esta lista.
 */
export const eventContracts = {
  'ai:stream': AiStreamEventSchema,
  /** Pide a la interfaz que navegue (p. ej. al pulsar una notificación). */
  'app:navigate': z.object({ to: z.string() }),
  /** Un post cambió de estado por la cola de publicación. */
  'publishing:update': z.object({ postId: IdSchema }),
  /** Avance de una exportación de vídeo. */
  'video:progress': ExportProgressSchema
} as const

export type EventName = keyof typeof eventContracts
export type EventPayload<K extends EventName> = (typeof eventContracts)[K]['_output']

export function isEventName(value: unknown): value is EventName {
  return typeof value === 'string' && value in eventContracts
}
