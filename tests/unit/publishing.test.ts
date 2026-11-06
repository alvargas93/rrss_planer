import { describe, expect, it, vi } from 'vitest'
import type { Connector, PublishInput, PublishResult } from '@shared/connectors/Connector'
import type { Account } from '@shared/domain/accounts'
import { statusFromExpiry } from '@shared/domain/accounts'
import type { MediaAsset } from '@shared/domain/media'
import type { PostDetail, PostStatus, PostSummary, PostVariant } from '@shared/domain/posts'
import type { PostTarget, TargetMode } from '@shared/domain/publishing'
import { MAX_ATTEMPTS, retryDelayMs } from '@shared/domain/publishing'
import type { Network } from '@shared/connectors/networks'
import { AppError } from '@shared/domain/errors'
import { PublishingService } from '@main/services/publishing.service'
import {
  INSTAGRAM_CAPABILITIES,
  InstagramConnector
} from '@main/connectors/instagram/instagram.connector'
import { ConnectorRegistry } from '@main/connectors/registry'
import { translateGraphError } from '@main/connectors/http'
import type { PostsRepository } from '@main/repositories/posts.repository'
import type { TargetsRepository } from '@main/repositories/targets.repository'
import type { AccountsService } from '@main/services/accounts.service'
import type { MediaHost } from '@main/media-host/media-host'
import { SettingsService } from '@main/services/settings.service'
import { InMemorySettingsRepository } from '@main/repositories/settings.repository'

// ------------------------------------------------------------- funciones puras

describe('reglas puras de publicación', () => {
  it('la espera entre reintentos crece: 2, 10, 30 minutos', () => {
    expect(retryDelayMs(0)).toBe(2 * 60_000)
    expect(retryDelayMs(1)).toBe(10 * 60_000)
    expect(retryDelayMs(2)).toBe(30 * 60_000)
    expect(retryDelayMs(9)).toBe(30 * 60_000)
  })

  it('estado de cuenta según la caducidad del token', () => {
    const now = new Date('2026-11-06T12:00:00Z')
    const days = (n: number): string => new Date(now.getTime() + n * 86_400_000).toISOString()
    expect(statusFromExpiry(null, now, null)).toBe('connected')
    expect(statusFromExpiry(days(30), now, null)).toBe('connected')
    expect(statusFromExpiry(days(5), now, null)).toBe('expiring')
    expect(statusFromExpiry(days(-1), now, null)).toBe('expired')
    expect(statusFromExpiry(days(30), now, 'token inválido')).toBe('error')
  })

  it('traduce los errores de la Graph API a códigos de la app', () => {
    expect(translateGraphError({ message: 'x', code: 190 }, 400).code).toBe('UNAUTHORIZED')
    expect(translateGraphError({ message: 'x', code: 4 }, 400).code).toBe('RATE_LIMITED')
    expect(translateGraphError({ message: 'x', code: 9 }, 400).code).toBe('RATE_LIMITED')
    expect(translateGraphError({ message: 'bad aspect', code: 36003 }, 400).code).toBe('VALIDATION')
    expect(translateGraphError({ message: 'x' }, 500).code).toBe('EXTERNAL_API')
  })
})

// ------------------------------------------------------------- validación del conector

const asset = (over: Partial<MediaAsset> = {}): MediaAsset => ({
  id: 'm1',
  fileName: 'm1.jpg',
  originalName: 'foto.jpg',
  kind: 'image',
  mime: 'image/jpeg',
  width: 1080,
  height: 1350,
  durationMs: null,
  sizeBytes: 500_000,
  sha256: 'x',
  altText: 'Una foto',
  derivedFrom: null,
  url: 'media://local/m1.jpg',
  createdAt: 'now',
  updatedAt: 'now',
  ...over
})

const variant = (over: Partial<PostVariant> = {}): PostVariant => ({
  id: 'v1',
  postId: 'p1',
  network: 'instagram',
  kind: 'feed',
  text: 'Hola #uno',
  hashtags: ['#uno'],
  extra: {},
  createdAt: 'now',
  updatedAt: 'now',
  ...over
})

describe('InstagramConnector.validate', () => {
  const ig = new InstagramConnector()
  const errors = (issues: ReturnType<typeof ig.validate>): string[] =>
    issues.filter((i) => i.level === 'error').map((i) => i.message)

  it('acepta una imagen JPEG 4:5 con pie corto', () => {
    expect(errors(ig.validate(variant(), [asset()]))).toEqual([])
  })

  it('rechaza PNG, proporción fuera de rango y exceso de peso', () => {
    const issues = errors(
      ig.validate(variant(), [
        asset({ mime: 'image/png', width: 1000, height: 2000, sizeBytes: 9 * 1024 * 1024 })
      ])
    )
    expect(issues.some((m) => m.includes('JPEG'))).toBe(true)
    expect(issues.some((m) => m.includes('proporción'))).toBe(true)
    expect(issues.some((m) => m.includes('MB'))).toBe(true)
  })

  it('exige medios, limita hashtags y caracteres', () => {
    const longText = 'a'.repeat(2201)
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ')
    const issues = errors(ig.validate(variant({ text: `${longText} ${tags}` }), []))
    expect(issues.some((m) => m.includes('2200'))).toBe(true)
    expect(issues.some((m) => m.includes('hashtags'))).toBe(true)
    expect(issues.some((m) => m.includes('al menos 1'))).toBe(true)
  })

  it('un reel necesita vídeo y una historia admite imagen o vídeo', () => {
    expect(errors(ig.validate(variant({ kind: 'reel' }), [asset()])).length).toBeGreaterThan(0)
    expect(
      errors(
        ig.validate(variant({ kind: 'reel' }), [
          asset({ kind: 'video', mime: 'video/mp4', durationMs: 20_000 })
        ])
      )
    ).toEqual([])
    expect(errors(ig.validate(variant({ kind: 'story' }), [asset()]))).toEqual([])
    expect(
      errors(
        ig.validate(variant({ kind: 'story' }), [
          asset({ kind: 'video', mime: 'video/mp4', durationMs: 90_000 })
        ])
      ).length
    ).toBeGreaterThan(0)
  })

  it('las capacidades declaran lo esencial', () => {
    expect(INSTAGRAM_CAPABILITIES.requiresPublicMediaUrl).toBe(true)
    expect(INSTAGRAM_CAPABILITIES.nativeScheduling).toBe(false)
    expect(Object.keys(INSTAGRAM_CAPABILITIES.kinds)).toEqual(['feed', 'carousel', 'reel', 'story'])
  })
})

// ------------------------------------------------------------- servicio con dobles

class FakeTargets {
  rows: PostTarget[] = []
  listByPost(postId: string): PostTarget[] {
    return this.rows.filter((t) => t.postId === postId)
  }
  listByPosts(ids: string[]): PostTarget[] {
    return this.rows.filter((t) => ids.includes(t.postId))
  }
  get(id: string): PostTarget {
    const t = this.rows.find((r) => r.id === id)
    if (!t) throw new AppError('NOT_FOUND', 'no')
    return t
  }
  listDue(now: string): PostTarget[] {
    return this.rows.filter(
      (t) =>
        ['pending', 'queued', 'failed'].includes(t.status) &&
        t.scheduledAt &&
        t.scheduledAt <= now &&
        (t.status !== 'failed' || (t.nextAttemptAt !== null && t.nextAttemptAt <= now))
    )
  }
  create(input: {
    postId: string
    variantId: string
    accountId: string | null
    network: Network
    mode: TargetMode
    scheduledAt: string | null
  }): PostTarget {
    const t: PostTarget = {
      id: `t${this.rows.length + 1}`,
      status: 'pending',
      externalPostId: null,
      externalUrl: null,
      publishedAt: null,
      attempts: 0,
      lastError: null,
      nextAttemptAt: null,
      createdAt: 'now',
      updatedAt: 'now',
      ...input
    }
    this.rows.push(t)
    return t
  }
  update(id: string, patch: Partial<PostTarget>): PostTarget {
    const t = this.get(id)
    Object.assign(t, patch)
    return t
  }
  delete(id: string): void {
    this.rows = this.rows.filter((t) => t.id !== id)
  }
}

class FakePosts {
  status: PostStatus = 'scheduled'
  constructor(public detail: PostDetail) {}
  get(): PostDetail {
    return { ...this.detail, post: { ...this.detail.post, status: this.status } }
  }
  summary(): PostSummary {
    const d = this.get()
    return {
      ...d.post,
      networks: d.variants.map((v) => v.network),
      mediaCount: d.media.length,
      thumbnailUrl: null,
      targets: []
    }
  }
  setStatus(_id: string, status: PostStatus): void {
    this.status = status
  }
}

const account: Account = {
  id: 'a1',
  network: 'instagram',
  externalId: '178',
  username: 'mi_cuenta',
  displayName: 'Mi cuenta',
  avatarUrl: null,
  accountType: 'business',
  status: 'connected',
  scopes: [],
  tokenExpiresAt: null,
  tokenRefreshedAt: null,
  lastError: null,
  meta: {},
  createdAt: 'now',
  updatedAt: 'now'
}

function fakeConnector(publish: (input: PublishInput) => Promise<PublishResult>): Connector {
  const ig = new InstagramConnector()
  return {
    network: 'instagram',
    capabilities: () => ig.capabilities(),
    identify: vi.fn(),
    refreshToken: vi.fn(),
    validate: (v, m) => ig.validate(v, m),
    publish
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(
  options: {
    publish?: (input: PublishInput) => Promise<PublishResult>
    hostConfigured?: boolean
    withAccount?: boolean
    scheduledAt?: string | null
  } = {}
) {
  const scheduledAt =
    options.scheduledAt === undefined ? '2026-11-10T10:00:00.000Z' : options.scheduledAt
  const posts = new FakePosts({
    post: {
      id: 'p1',
      title: 'Reel',
      body: 'Hola #uno',
      pillarId: null,
      ideaId: null,
      status: 'scheduled',
      scheduledAt,
      notes: '',
      createdAt: 'now',
      updatedAt: 'now'
    },
    variants: [variant()],
    media: [asset()],
    targets: []
  })
  const targets = new FakeTargets()
  const notify = vi.fn()
  const onPostChanged = vi.fn()
  const removed = vi.fn(async () => undefined)
  const host: MediaHost = {
    kind: 'cloudinary',
    isConfigured: () => options.hostConfigured ?? true,
    upload: vi.fn(async () => ({ publicUrl: 'https://cdn.example/x.jpg', remove: removed }))
  }
  const connector = fakeConnector(
    options.publish ??
      (async () => ({ externalPostId: 'ig123', externalUrl: 'https://instagram.com/p/x' }))
  )
  const accounts = {
    list: () => (options.withAccount === false ? [] : [account]),
    get: () => account,
    tokenFor: () => 'token',
    markError: vi.fn()
  } as unknown as AccountsService
  const settings = new SettingsService(new InMemorySettingsRepository())
  const service = new PublishingService({
    posts: posts as unknown as PostsRepository,
    targets: targets as unknown as TargetsRepository,
    accounts,
    connectors: new ConnectorRegistry([connector]),
    mediaHost: () => host,
    settings,
    notify,
    mediaDir: 'C:/tmp',
    onPostChanged,
    copyToClipboard: vi.fn()
  })
  return { service, posts, targets, notify, host, removed, accounts }
}

describe('PublishingService', () => {
  it('crea un destino por red y asigna la única cuenta de esa red', () => {
    const { service } = setup()
    const targets = service.syncTargets('p1')
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({
      network: 'instagram',
      accountId: 'a1',
      mode: 'api',
      status: 'pending'
    })
  })

  it('sin cuenta conectada el destino nace en modo manual', () => {
    const { service } = setup({ withAccount: false })
    expect(service.syncTargets('p1')[0]?.mode).toBe('manual')
  })

  it('publica por API: sube, publica, borra el alojamiento y marca el post', async () => {
    const { service, posts, host, removed, notify } = setup()
    const targets = await service.publishNow('p1')
    expect(targets[0]).toMatchObject({ status: 'published', externalPostId: 'ig123' })
    expect(host.upload).toHaveBeenCalledTimes(1)
    expect(removed).toHaveBeenCalledTimes(1)
    expect(posts.status).toBe('published')
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Publicado en Instagram' })
    )
  })

  it('si el medio no pasa la validación, falla sin llamar a la API', async () => {
    const { service, host } = setup()
    const detail = (service as unknown as { deps: { posts: FakePosts } }).deps.posts.detail
    detail.media = [asset({ mime: 'image/png' })]
    const targets = await service.publishNow('p1')
    expect(targets[0]?.status).toBe('failed')
    expect(targets[0]?.lastError).toContain('JPEG')
    expect(host.upload).not.toHaveBeenCalled()
  })

  it('sin alojamiento configurado pasa a modo manual y avisa', async () => {
    const { service, notify, posts } = setup({ hostConfigured: false })
    const targets = await service.publishNow('p1')
    expect(targets[0]?.status).toBe('manual_notified')
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('Hora de publicar') })
    )
    expect(posts.status).toBe('scheduled')
  })

  it('un fallo temporal programa un reintento y se agota tras el máximo', async () => {
    const { service, targets } = setup({
      publish: async () => {
        throw new AppError('EXTERNAL_API', 'Instagram no responde')
      }
    })
    service.syncTargets('p1')
    const due = async (at: string): Promise<void> => service.runDue(new Date(at))
    await due('2026-11-10T10:00:30.000Z')
    expect(targets.rows[0]).toMatchObject({ status: 'failed', attempts: 1 })
    expect(targets.rows[0]?.nextAttemptAt).not.toBeNull()
    await due('2026-11-10T10:01:00.000Z') // aún no toca el reintento
    expect(targets.rows[0]?.attempts).toBe(1)
    await due('2026-11-10T10:03:00.000Z')
    expect(targets.rows[0]?.attempts).toBe(2)
    await due('2026-11-10T10:20:00.000Z')
    expect(targets.rows[0]?.attempts).toBe(MAX_ATTEMPTS)
    expect(targets.rows[0]?.nextAttemptAt).toBeNull()
  })

  it('un token caducado no se reintenta y marca la cuenta con error', async () => {
    const { service, targets, accounts } = setup({
      publish: async () => {
        throw new AppError('UNAUTHORIZED', 'caducado')
      }
    })
    await service.publishNow('p1')
    expect(targets.rows[0]).toMatchObject({ status: 'failed', nextAttemptAt: null })
    expect(accounts.markError).toHaveBeenCalled()
  })

  it('una publicación con más de 24 h de retraso no se publica sola', async () => {
    const { service, targets, notify } = setup()
    service.syncTargets('p1')
    await service.runDue(new Date('2026-11-12T10:00:00.000Z'))
    expect(targets.rows[0]?.status).toBe('failed')
    expect(targets.rows[0]?.lastError).toContain('cerrada')
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Publicación atrasada' }))
  })

  it('sin fecha no hay nada que ejecutar', async () => {
    const { service, targets } = setup({ scheduledAt: null })
    service.syncTargets('p1')
    await service.runDue(new Date('2026-11-12T10:00:00.000Z'))
    expect(targets.rows[0]?.status).toBe('pending')
  })
})
