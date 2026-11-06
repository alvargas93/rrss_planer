import { eventContracts, type EventName, type EventPayload } from '@shared/contracts/events'

/**
 * Suscripción tipada a un evento que empuja el proceso principal.
 * Valida cada carga con su esquema; las que no cuadran se ignoran (y se registran).
 */
export function onEvent<K extends EventName>(
  channel: K,
  listener: (payload: EventPayload<K>) => void
): () => void {
  return window.api.on(channel, (raw) => {
    const parsed = eventContracts[channel].safeParse(raw)
    if (parsed.success) listener(parsed.data as EventPayload<K>)
    else console.warn(`Evento ${channel} con carga inválida`, parsed.error.issues)
  })
}
