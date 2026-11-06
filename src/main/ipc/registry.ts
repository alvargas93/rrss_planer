import { ipcMain } from 'electron'
import {
  contracts,
  type ChannelName,
  type ChannelParsedInput,
  type ChannelOutput
} from '@shared/contracts'
import { AppError, type IpcResult } from '@shared/domain/errors'
import { createLogger } from '../log'

const log = createLogger('ipc')

type Handler<K extends ChannelName> = (
  input: ChannelParsedInput<K>
) => ChannelOutput<K> | Promise<ChannelOutput<K>>

/**
 * Registra un manejador para un canal declarado en los contratos.
 * Valida la entrada con Zod, ejecuta y envuelve el resultado en IpcResult.
 * Las excepciones nunca cruzan el puente: se convierten en { ok: false, error }.
 */
export function handle<K extends ChannelName>(channel: K, handler: Handler<K>): void {
  const contract = contracts[channel]
  ipcMain.handle(
    channel,
    async (_event, rawInput: unknown): Promise<IpcResult<ChannelOutput<K>>> => {
      const parsed = contract.input.safeParse(rawInput)
      if (!parsed.success) {
        log.warn(`Entrada inválida en ${channel}`, parsed.error.issues)
        return {
          ok: false,
          error: new AppError(
            'VALIDATION',
            'Datos de entrada no válidos',
            parsed.error.issues
          ).toJSON()
        }
      }
      try {
        const data = await handler(parsed.data as ChannelParsedInput<K>)
        return { ok: true, data }
      } catch (error) {
        const appError = AppError.from(error)
        log.error(`Fallo en ${channel}: ${appError.message}`)
        return { ok: false, error: appError.toJSON() }
      }
    }
  )
}
