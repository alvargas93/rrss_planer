import { contextBridge, ipcRenderer } from 'electron'
import { isChannelName } from '@shared/contracts'
import type { IpcResult } from '@shared/domain/errors'

/**
 * Puente entre la interfaz y el proceso principal.
 * Solo expone `invoke` y solo para los canales declarados en shared/contracts.
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
  }
}

export type PreloadApi = typeof api

contextBridge.exposeInMainWorld('api', api)
