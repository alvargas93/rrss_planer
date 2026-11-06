import type { ChannelName, ChannelInput, ChannelOutput } from '@shared/contracts'
import type { SerializedError } from '@shared/domain/errors'

/** Error que la interfaz recibe cuando el proceso principal devuelve { ok: false }. */
export class IpcError extends Error {
  readonly code: SerializedError['code']
  readonly details?: unknown

  constructor(error: SerializedError) {
    super(error.message)
    this.name = 'IpcError'
    this.code = error.code
    this.details = error.details
  }
}

type Args<K extends ChannelName> = ChannelInput<K> extends undefined ? [] : [input: ChannelInput<K>]

/**
 * Llamada tipada al proceso principal. El nombre del canal fija los tipos de
 * entrada y salida a partir de shared/contracts, así que un error de tipo se ve
 * al compilar, no en tiempo de ejecución.
 */
export async function invoke<K extends ChannelName>(
  channel: K,
  ...args: Args<K>
): Promise<ChannelOutput<K>> {
  const result = await window.api.invoke(channel, args[0])
  if (!result.ok) throw new IpcError(result.error)
  return result.data as ChannelOutput<K>
}
