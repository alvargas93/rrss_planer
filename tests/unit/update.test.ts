/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it, vi } from 'vitest'
import { UpdateService, type UpdaterLike, type UpdateState } from '@main/services/update.service'
import type { SettingsService } from '@main/services/settings.service'
import { applySettingsPatch, DEFAULT_SETTINGS, type Settings } from '@shared/domain/settings'

class FakeUpdater implements UpdaterLike {
  autoDownload = true
  autoInstallOnAppQuit = true
  handlers = new Map<string, (payload: never) => void>()
  setFeedURL = vi.fn()
  checkForUpdates = vi.fn(async () => undefined)
  downloadUpdate = vi.fn(async () => undefined)
  quitAndInstall = vi.fn()
  on(event: string, listener: (payload: never) => void) {
    this.handlers.set(event, listener)
  }
  fire(event: string, payload: unknown = {}) {
    this.handlers.get(event)!(payload as never)
  }
}

function setup(options: { packaged?: boolean; general?: Partial<Settings['general']> } = {}) {
  let settings: Settings = applySettingsPatch(DEFAULT_SETTINGS, { general: options.general ?? {} })
  const settingsService = { get: () => settings } as unknown as SettingsService
  const updater = new FakeUpdater()
  const states: UpdateState[] = []
  const service = new UpdateService({
    updater,
    settings: settingsService,
    emit: (s) => states.push(s),
    currentVersion: '1.0.0',
    isPackaged: options.packaged ?? true
  })
  return {
    service,
    updater,
    states,
    setGeneral: (g: Partial<Settings['general']>) =>
      (settings = applySettingsPatch(settings, { general: g }))
  }
}

describe('UpdateService', () => {
  it('nunca descarga ni instala solo', () => {
    const { updater } = setup()
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
  })

  it('en desarrollo no comprueba nada', async () => {
    const { service, updater } = setup({ packaged: false })
    expect((await service.check()).status).toBe('dev')
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('sin dirección configurada lo dice claramente', async () => {
    const { service, updater } = setup()
    expect((await service.check()).status).toBe('not-configured')
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('con dirección configurada comprueba, y avisa de la versión nueva', async () => {
    const { service, updater } = setup({ general: { updateFeedUrl: 'https://ejemplo.com/rrss/' } })
    await service.check()
    expect(updater.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://ejemplo.com/rrss/'
    })
    updater.fire('update-available', { version: '1.1.0' })
    expect(service.get()).toMatchObject({ status: 'available', version: '1.1.0' })
  })

  it('descargar e instalar solo cuando el usuario lo pide y en su orden', async () => {
    const { service, updater } = setup({ general: { updateFeedUrl: 'https://ejemplo.com/' } })
    service.install() // todavía no hay nada descargado
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    await service.download() // tampoco hay versión encontrada
    expect(updater.downloadUpdate).not.toHaveBeenCalled()

    await service.check()
    updater.fire('update-available', { version: '1.1.0' })
    await service.download()
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1)
    updater.fire('download-progress', { percent: 41.6 })
    expect(service.get()).toMatchObject({ status: 'downloading', percent: 42 })
    updater.fire('update-downloaded', { version: '1.1.0' })
    service.install()
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('un error de red se muestra con un mensaje claro', async () => {
    const { service, updater } = setup({ general: { updateFeedUrl: 'https://ejemplo.com/' } })
    updater.checkForUpdates.mockRejectedValueOnce(new Error('ENOTFOUND'))
    const state = await service.check()
    expect(state.status).toBe('error')
    expect(state.message).toMatch(/No se pudo comprobar/)
  })

  it('la comprobación automática respeta el ajuste', async () => {
    const { service, updater, setGeneral } = setup({
      general: { updateFeedUrl: 'https://ejemplo.com/', autoCheckUpdates: false }
    })
    await service.autoCheck()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    setGeneral({ autoCheckUpdates: true })
    await service.autoCheck()
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })
})
