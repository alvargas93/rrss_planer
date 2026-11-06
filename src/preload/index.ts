import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { isChannelName } from '@shared/contracts'
import { isEventName } from '@shared/contracts/events'
import type { IpcResult } from '@shared/domain/errors'

/**
 * Puente entre la interfaz y el proceso principal.
 * - `invoke`: petición/respuesta, solo para canales declarados en shared/contracts.
 * - `on`: suscripción a eventos que el proceso principal empuja (streaming de Claude),
 *   solo para canales declarados en shared/contracts/events.
 * Nada de Node ni de Electron llega al renderer.
 */
const api = {
  invoke: async (channel: string, input?: unknown): Promise<IpcResult<unknown>> => {
    if (!isChannelName(channel)) {
      return {
        ok: false,
        error: { code: 'VALIDATION', message: `Canal IPC no permitido: ${channel}` }
      }
    }
    return ipcRenderer.invoke(channel, input) as Promise<IpcResult<unknown>>
  },

  on: (channel: string, listener: (payload: unknown) => void): (() => void) => {
    if (!isEventName(channel)) return () => undefined
    const wrapped = (_event: IpcRendererEvent, payload: unknown): void => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

export type PreloadApi = typeof api

contextBridge.exposeInMainWorld('api', api)
