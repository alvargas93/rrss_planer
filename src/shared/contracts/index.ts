import { z } from 'zod'
import { SettingsPatchSchema, SettingsSchema } from '../domain/settings'
import { AppInfoSchema } from '../domain/app-info'

/**
 * Contratos IPC: la única lista de canales que existe.
 * - El proceso principal valida `input` antes de ejecutar.
 * - El preload solo deja pasar canales que estén aquí.
 * - La interfaz obtiene los tipos de entrada y salida automáticamente.
 *
 * Convención de nombre: `<módulo>:<acción>`.
 */
export const contracts = {
  'app:getInfo': { input: z.undefined(), output: AppInfoSchema },
  'app:openDataFolder': { input: z.undefined(), output: z.void() },
  'app:openExternal': { input: z.object({ url: z.url() }), output: z.void() },

  'settings:get': { input: z.undefined(), output: SettingsSchema },
  'settings:update': { input: SettingsPatchSchema, output: SettingsSchema },
  'settings:reset': { input: z.undefined(), output: SettingsSchema }
} as const

export type Contracts = typeof contracts
export type ChannelName = keyof Contracts
export type ChannelInput<K extends ChannelName> = z.input<Contracts[K]['input']>
export type ChannelOutput<K extends ChannelName> = z.output<Contracts[K]['output']>

export const channelNames = Object.keys(contracts) as ChannelName[]

export function isChannelName(value: unknown): value is ChannelName {
  return typeof value === 'string' && value in contracts
}
