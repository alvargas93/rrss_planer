import { app, shell } from 'electron'
import { handle } from './registry'
import { AppError } from '@shared/domain/errors'
import type { AppInfo } from '@shared/domain/app-info'
import type { SettingsService } from '../services/settings.service'
import type { TasksService } from '../services/tasks.service'
import type { MediaService } from '../services/media.service'
import type { DashboardService } from '../services/dashboard.service'
import type { PillarsRepository } from '../repositories/pillars.repository'
import type { IdeasRepository } from '../repositories/ideas.repository'
import type { PostsRepository } from '../repositories/posts.repository'
import type { AiService } from '../ai/ai.service'
import { APP_DISPLAY_NAME, getDataDir, getDbPath } from '../paths'

export interface IpcDependencies {
  settings: SettingsService
  pillars: PillarsRepository
  ideas: IdeasRepository
  tasks: TasksService
  posts: PostsRepository
  media: MediaService
  dashboard: DashboardService
  ai: AiService
}

/** Conecta cada canal de los contratos con el servicio que lo atiende. */
export function registerAllIpc(deps: IpcDependencies): void {
  // --- app ---
  handle('app:getInfo', (): AppInfo => ({
    name: APP_DISPLAY_NAME,
    version: app.getVersion(),
    platform: process.platform as AppInfo['platform'],
    isDev: !app.isPackaged,
    dataDir: getDataDir(),
    dbPath: getDbPath(),
    electron: process.versions.electron ?? 'desconocida',
    node: process.versions.node
  }))

  handle('app:openDataFolder', async () => {
    const result = await shell.openPath(getDataDir())
    if (result) throw new AppError('IO', `No se pudo abrir la carpeta: ${result}`)
  })

  handle('app:openExternal', async ({ url }) => {
    if (!url.startsWith('https://')) {
      throw new AppError('VALIDATION', 'Solo se abren enlaces https')
    }
    await shell.openExternal(url)
  })

  // --- settings ---
  handle('settings:get', () => deps.settings.get())
  handle('settings:update', (patch) => deps.settings.update(patch))
  handle('settings:reset', () => deps.settings.reset())

  // --- pillars ---
  handle('pillars:list', () => deps.pillars.list())
  handle('pillars:create', (input) => deps.pillars.create(input))
  handle('pillars:update', (input) => deps.pillars.update(input))
  handle('pillars:delete', ({ id }) => deps.pillars.delete(id))

  // --- ideas ---
  handle('ideas:list', (filter) => deps.ideas.list(filter))
  handle('ideas:create', (input) => deps.ideas.create(input))
  handle('ideas:update', (input) => deps.ideas.update(input))
  handle('ideas:delete', ({ id }) => deps.ideas.delete(id))

  // --- tasks ---
  handle('tasks:list', () => deps.tasks.list())
  handle('tasks:create', (input) => deps.tasks.create(input))
  handle('tasks:update', (input) => deps.tasks.update(input))
  handle('tasks:move', (input) => deps.tasks.move(input))
  handle('tasks:delete', ({ id }) => deps.tasks.delete(id))

  // --- posts ---
  handle('posts:list', (filter) => deps.posts.list(filter))
  handle('posts:get', ({ id }) => deps.posts.get(id))
  handle('posts:create', (input) => deps.posts.create(input))
  handle('posts:update', ({ id, patch }) => deps.posts.update(id, patch))
  handle('posts:schedule', ({ id, scheduledAt }) => deps.posts.schedule(id, scheduledAt))
  handle('posts:delete', ({ id }) => deps.posts.delete(id))

  // --- media ---
  handle('media:import', () => deps.media.import())
  handle('media:list', () => deps.media.list())
  handle('media:update', ({ id, patch }) => deps.media.update(id, patch))
  handle('media:delete', ({ id }) => deps.media.delete(id))

  // --- dashboard ---
  handle('dashboard:summary', () => deps.dashboard.summary())

  // --- Claude ---
  handle('ai:status', () => deps.ai.status())
  handle('ai:setApiKey', ({ apiKey }) => deps.ai.setApiKey(apiKey))
  handle('ai:clearApiKey', () => deps.ai.clearApiKey())
  handle('ai:testConnection', () => deps.ai.testConnection())
  handle('ai:usageHistory', () => deps.ai.usageHistory())
  handle('ai:conversations:list', () => deps.ai.listConversations())
  handle('ai:conversations:create', ({ title, context }) =>
    deps.ai.createConversation(title, context)
  )
  handle('ai:conversations:delete', ({ id }) => deps.ai.deleteConversation(id))
  handle('ai:messages:list', ({ conversationId }) => deps.ai.listMessages(conversationId))
  handle('ai:chat', (request) => deps.ai.chat(request))
  handle('ai:runAction', (request) => deps.ai.runAction(request))
}
