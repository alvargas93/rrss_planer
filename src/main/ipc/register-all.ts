import { app, shell } from 'electron'
import { handle } from './registry'
import { AppError } from '@shared/domain/errors'
import type { AppInfo } from '@shared/domain/app-info'
import type { PostDetail } from '@shared/domain/posts'
import type { SettingsService } from '../services/settings.service'
import type { TasksService } from '../services/tasks.service'
import type { MediaService } from '../services/media.service'
import type { DashboardService } from '../services/dashboard.service'
import type { PillarsRepository } from '../repositories/pillars.repository'
import type { IdeasRepository } from '../repositories/ideas.repository'
import type { PostsRepository } from '../repositories/posts.repository'
import type { AiService } from '../ai/ai.service'
import type { AccountsService } from '../services/accounts.service'
import type { PublishingService } from '../services/publishing.service'
import type { AnalyticsService } from '../services/analytics.service'
import type { VideoService } from '../services/video.service'
import type { SecretStore } from '../secrets/secrets.service'
import type { MediaHost } from '../media-host/media-host'
import { APP_DISPLAY_NAME, getDataDir, getDbPath } from '../paths'
import { OAUTH_NETWORKS } from '@shared/domain/accounts'
import { CLIENT_ID_SETTING, clientSecretKey } from '../connectors/clients'

export const PUBLISHING_SECRET_KEYS = {
  cloudinaryApiSecret: 'cloudinary.apiSecret',
  instagramAppSecret: 'instagram.appSecret'
} as const

export interface IpcDependencies {
  settings: SettingsService
  pillars: PillarsRepository
  ideas: IdeasRepository
  tasks: TasksService
  posts: PostsRepository
  media: MediaService
  dashboard: DashboardService
  ai: AiService
  accounts: AccountsService
  publishing: PublishingService
  secrets: SecretStore
  mediaHost: () => MediaHost
  analytics: AnalyticsService
  video: VideoService
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
  const detailWithTargets = (id: string): PostDetail => ({
    ...deps.posts.get(id),
    targets: deps.publishing.syncTargets(id)
  })
  handle('posts:list', (filter) => deps.publishing.withTargets(deps.posts.list(filter)))
  handle('posts:get', ({ id }) => detailWithTargets(id))
  handle('posts:create', (input) => detailWithTargets(deps.posts.create(input).post.id))
  handle('posts:update', ({ id, patch }) => detailWithTargets(deps.posts.update(id, patch).post.id))
  handle('posts:schedule', ({ id, scheduledAt }) => {
    deps.posts.schedule(id, scheduledAt)
    deps.publishing.syncTargets(id)
    return deps.publishing.withTargets([deps.posts.summary(id)])[0]!
  })
  handle('posts:delete', ({ id }) => deps.posts.delete(id))

  // --- cuentas ---
  handle('accounts:list', () => deps.accounts.list())
  handle('accounts:connectInstagramToken', ({ accessToken }) =>
    deps.accounts.connectInstagramWithToken(accessToken)
  )
  handle('accounts:connectInstagramOAuth', async ({ appId, appSecret }) => {
    deps.secrets.set(PUBLISHING_SECRET_KEYS.instagramAppSecret, appSecret)
    deps.settings.update({ publishing: { instagramAppId: appId } })
    return deps.accounts.connectInstagramOAuth({ appId, appSecret })
  })
  handle('accounts:connectOAuth', async ({ network, clientId, clientSecret }) => {
    const secretKey = clientSecretKey(network)
    if (clientSecret) deps.secrets.set(secretKey, clientSecret)
    deps.settings.update({ publishing: { [CLIENT_ID_SETTING[network]]: clientId } })
    return deps.accounts.connectOAuth(network, {
      clientId,
      clientSecret: clientSecret || deps.secrets.get(secretKey) || ''
    })
  })
  handle('accounts:connectLinkedInToken', ({ accessToken }) =>
    deps.accounts.connectLinkedInWithToken(accessToken)
  )
  handle('accounts:oauthClients', () => {
    const publishing = deps.settings.get().publishing
    return Object.fromEntries(
      OAUTH_NETWORKS.map((network) => [
        network,
        {
          clientId: publishing[CLIENT_ID_SETTING[network]],
          hasSecret: deps.secrets.has(clientSecretKey(network))
        }
      ])
    )
  })
  handle('accounts:refresh', ({ id }) => deps.accounts.refresh(id))
  handle('accounts:disconnect', ({ id }) => deps.accounts.disconnect(id))
  handle('accounts:capabilities', ({ network }) => deps.accounts.capabilities(network))

  // --- publicación ---
  handle('publishing:setTarget', (input) => deps.publishing.setTarget(input))
  handle('publishing:publishNow', ({ postId, targetId }) =>
    deps.publishing.publishNow(postId, targetId)
  )
  handle('publishing:validate', ({ id }) => deps.publishing.validate(id))
  handle('publishing:retry', ({ targetId }) => deps.publishing.retry(targetId))
  handle('publishing:cancel', ({ targetId }) => deps.publishing.cancel(targetId))
  handle('publishing:hostStatus', () => {
    const host = deps.mediaHost()
    return {
      kind: host.kind,
      configured: host.isConfigured(),
      hasSecret: deps.secrets.has(PUBLISHING_SECRET_KEYS.cloudinaryApiSecret)
    }
  })
  handle('publishing:setCloudinarySecret', ({ apiSecret }) => {
    deps.secrets.set(PUBLISHING_SECRET_KEYS.cloudinaryApiSecret, apiSecret)
  })
  handle('publishing:setInstagramAppSecret', ({ appSecret }) => {
    deps.secrets.set(PUBLISHING_SECRET_KEYS.instagramAppSecret, appSecret)
  })

  // --- media ---
  handle('media:import', () => deps.media.import())
  handle('media:list', () => deps.media.list())
  handle('media:update', ({ id, patch }) => deps.media.update(id, patch))
  handle('media:delete', ({ id }) => deps.media.delete(id))
  handle('media:reprocess', ({ id }) => deps.media.reprocess(id))
  handle('media:ensureJpeg', ({ id }) => deps.media.ensureJpeg(deps.media.get(id)))

  // --- dashboard ---
  handle('dashboard:summary', () => deps.dashboard.summary())

  // --- analítica ---
  handle('analytics:overview', (query) => deps.analytics.overview(query))
  handle('analytics:sync', ({ accountId }) =>
    accountId ? deps.analytics.sync(accountId).then((r) => [r]) : deps.analytics.syncAll()
  )
  handle('analytics:digest', (query) => ({ text: deps.analytics.digest(query) }))

  // --- vídeo ---
  handle('video:projects:list', () => deps.video.list())
  handle('video:projects:create', (input) => deps.video.create(input))
  handle('video:projects:update', ({ id, patch }) => deps.video.update(id, patch))
  handle('video:projects:delete', ({ id }) => deps.video.delete(id))
  handle('video:export', ({ id }) => deps.video.export(id))
  handle('video:transcribe', ({ id }) => deps.video.transcribe(id))

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
