/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Account } from '@shared/domain/accounts'
import type { MediaAsset } from '@shared/domain/media'
import type { PostVariant } from '@shared/domain/posts'
import type { Connector } from '@shared/connectors/Connector'
import { runLoopback } from '@main/connectors/oauth-pkce'
import {
  YoutubeConnector,
  nextOffsetFromRange,
  YOUTUBE_CAPABILITIES
} from '@main/connectors/youtube/youtube.connector'
import { pointsFromReport } from '@main/connectors/youtube/youtube.analytics'
import { LinkedInConnector, escapeLittle } from '@main/connectors/linkedin/linkedin.connector'
import { XConnector, mediaCategory } from '@main/connectors/x/x.connector'
import { ConnectorRegistry } from '@main/connectors/registry'
import { AccountsService } from '@main/services/accounts.service'
import type { AccountsRepository } from '@main/repositories/accounts.repository'

// Sin esperas reales en los reintentos.
vi.mock('@main/connectors/net', async (original) => ({
  ...(await original<typeof import('@main/connectors/net')>()),
  sleep: async () => undefined
}))

const asset = (over: Partial<MediaAsset> = {}): MediaAsset =>
  ({
    id: 'm1',
    fileName: 'a.bin',
    originalName: 'a.bin',
    kind: 'video',
    mime: 'video/mp4',
    width: 1080,
    height: 1920,
    durationMs: 30_000,
    sizeBytes: 2_000_000,
    sha256: 'x',
    altText: '',
    derivedFrom: null,
    url: '',
    thumbUrl: null,
    probe: null,
    createdAt: 'now',
    updatedAt: 'now',
    ...over
  }) as unknown as MediaAsset

const variant = (over: Partial<PostVariant> = {}): PostVariant =>
  ({
    id: 'v1',
    postId: 'p1',
    network: 'youtube',
    kind: 'video',
    text: 'Descripción',
    hashtags: [],
    extra: { title: 'Mi vídeo' },
    createdAt: 'now',
    updatedAt: 'now',
    ...over
  }) as unknown as PostVariant

const account = (over: Partial<Account> = {}): Account =>
  ({
    id: 'acc1',
    network: 'youtube',
    externalId: 'UC1',
    username: 'yo',
    displayName: 'Yo',
    avatarUrl: null,
    accountType: 'canal',
    status: 'connected',
    scopes: [],
    tokenExpiresAt: null,
    tokenRefreshedAt: null,
    lastError: null,
    meta: {},
    createdAt: 'now',
    updatedAt: 'now',
    ...over
  }) as unknown as Account

interface Call {
  url: string
  init: RequestInit
}
type Route = (call: Call) => Response | Promise<Response> | undefined

function stubFetch(routes: Route[]): Call[] {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string, init: RequestInit = {}) => {
      const call = { url: String(input), init }
      calls.push(call)
      for (const route of routes) {
        const response = await route(call)
        if (response) return response
      }
      throw new Error(`Sin ruta simulada para ${call.url}`)
    })
  )
  return calls
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })

const header = (init: RequestInit, name: string): string | undefined =>
  (init.headers as Record<string, string> | undefined)?.[name]

afterEach(() => vi.unstubAllGlobals())

let dir: string
let file: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rrss-p7-'))
  file = join(dir, 'video.bin')
  writeFileSync(file, Buffer.alloc(2000, 7))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('OAuth de escritorio (servidor local + PKCE)', () => {
  it('recibe el código, comprueba el state y entrega un verifier que casa con el challenge', async () => {
    let challenge = ''
    const result = await runLoopback({
      label: 'Prueba',
      authorizeUrl: 'https://auth.example/authorize',
      params: { client_id: 'c1' },
      redirectHost: '127.0.0.1',
      port: 0,
      pkce: true,
      openUrl: (url) => {
        const u = new URL(url)
        challenge = u.searchParams.get('code_challenge') ?? ''
        expect(u.searchParams.get('code_challenge_method')).toBe('S256')
        expect(u.searchParams.get('client_id')).toBe('c1')
        void fetch(
          `${u.searchParams.get('redirect_uri')}?code=abc&state=${u.searchParams.get('state')}`
        )
      }
    })
    expect(result.code).toBe('abc')
    expect(result.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)
    expect(createHash('sha256').update(result.codeVerifier!).digest('base64url')).toBe(challenge)
  })

  it('rechaza una respuesta con state distinto (protección CSRF)', async () => {
    const promise = runLoopback({
      label: 'Prueba',
      authorizeUrl: 'https://auth.example/authorize',
      params: {},
      redirectHost: 'localhost',
      port: 0,
      pkce: false,
      openUrl: (url) => {
        const u = new URL(url)
        void fetch(`${u.searchParams.get('redirect_uri')}?code=abc&state=otro`)
      }
    })
    await expect(promise).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('YouTube', () => {
  const connector = new YoutubeConnector(() => ({ clientId: 'id', clientSecret: 's' }))

  it('exige título y un vídeo; avisa si un Short es horizontal', () => {
    expect(
      connector.validate(variant({ extra: {} }), [asset()]).some((i) => i.level === 'error')
    ).toBe(true)
    expect(connector.validate(variant(), []).some((i) => i.message.includes('un vídeo'))).toBe(true)
    expect(connector.validate(variant(), [asset()])).toEqual([])
    const horizontal = connector.validate(variant({ kind: 'short' }), [
      asset({ width: 1920, height: 1080 })
    ])
    expect(horizontal.some((i) => i.level === 'warning')).toBe(true)
  })

  it('calcula el siguiente byte a partir de la cabecera Range', () => {
    expect(nextOffsetFromRange('bytes=0-99')).toBe(100)
    expect(nextOffsetFromRange(null)).toBe(0)
  })

  it('convierte el informe de Analytics en puntos diarios con nombres internos', () => {
    const points = pointsFromReport({
      columnHeaders: [{ name: 'day' }, { name: 'views' }, { name: 'estimatedMinutesWatched' }],
      rows: [['2026-11-01', 10, 55]]
    })
    expect(points).toEqual([
      { metric: 'views', day: '2026-11-01', value: 10 },
      { metric: 'minutes_watched', day: '2026-11-01', value: 55 }
    ])
  })

  it('sube el vídeo, retoma tras un corte de red y avisa si YouTube lo deja en privado', async () => {
    let puts = 0
    const calls = stubFetch([
      ({ url, init }) =>
        url.includes('/upload/youtube/v3/videos') && init.method === 'POST'
          ? new Response(null, { status: 200, headers: { location: 'https://upload.example/s1' } })
          : undefined,
      ({ url, init }) => {
        if (url !== 'https://upload.example/s1') return undefined
        puts++
        if (puts === 1) throw new TypeError('fetch failed') // corte de red
        if (header(init, 'Content-Range') === 'bytes */2000') {
          return new Response(null, { status: 308, headers: { range: 'bytes=0-99' } })
        }
        return json({ id: 'vid1', status: { privacyStatus: 'private' } }, 200)
      }
    ])
    const result = await connector.publish({
      account: account(),
      accessToken: 'tok',
      variant: variant({ kind: 'short' }),
      media: [{ asset: asset(), publicUrl: '', filePath: file }]
    })
    expect(result.externalPostId).toBe('vid1')
    expect(result.externalUrl).toBe('https://www.youtube.com/shorts/vid1')
    expect(result.notice).toMatch(/private/)
    const last = calls.at(-1)!
    expect(header(last.init, 'Content-Range')).toBe('bytes 100-1999/2000')
    const session = calls[0]!
    const body = JSON.parse(String(session.init.body))
    expect(body.snippet.title).toBe('Mi vídeo')
    expect(body.snippet.description).toContain('#Shorts')
    expect(body.status.privacyStatus).toBe('public')
    expect(header(session.init, 'Authorization')).toBe('Bearer tok')
  })

  it('programa con publishAt: sube como privado y deja la hora a YouTube', async () => {
    const calls = stubFetch([
      ({ url, init }) =>
        url.includes('/upload/youtube/v3/videos') && init.method === 'POST'
          ? new Response(null, { status: 200, headers: { location: 'https://upload.example/s2' } })
          : undefined,
      ({ url }) =>
        url === 'https://upload.example/s2'
          ? json({ id: 'vid2', status: { privacyStatus: 'private' } })
          : undefined
    ])
    const result = await connector.publish({
      account: account(),
      accessToken: 'tok',
      variant: variant(),
      media: [{ asset: asset(), publicUrl: '', filePath: file }],
      publishAt: '2026-12-01T10:00:00.000Z'
    })
    const body = JSON.parse(String(calls[0]!.init.body))
    expect(body.status).toMatchObject({
      privacyStatus: 'private',
      publishAt: '2026-12-01T10:00:00.000Z'
    })
    expect(result.notice).toBeNull() // privado es lo pedido: no es una restricción de YouTube
  })

  it('renueva el acceso con el refresh token', async () => {
    const calls = stubFetch([() => json({ access_token: 'nuevo', expires_in: 3600 })])
    const refreshed = await connector.refreshToken('viejo', 'r1')
    expect(refreshed.accessToken).toBe('nuevo')
    expect(refreshed.expiresAt).not.toBeNull()
    expect(String(calls[0]!.init.body)).toContain('grant_type=refresh_token')
    await expect(connector.refreshToken('viejo', null)).rejects.toMatchObject({
      code: 'UNAUTHORIZED'
    })
  })

  it('declara programación nativa y que no necesita URL pública', () => {
    expect(YOUTUBE_CAPABILITIES.nativeScheduling).toBe(true)
    expect(YOUTUBE_CAPABILITIES.requiresPublicMediaUrl).toBe(false)
  })
})

describe('LinkedIn', () => {
  const connector = new LinkedInConnector()

  it('escapa los caracteres reservados del texto salvo los hashtags', () => {
    expect(escapeLittle('Hola (mundo) #tag @yo a_b *x*')).toBe(
      'Hola \\(mundo\\) #tag \\@yo a\\_b \\*x\\*'
    )
    expect(escapeLittle('# suelto')).toBe('\\# suelto')
    expect(escapeLittle('#mi_tag')).toBe('#mi_tag')
  })

  it('valida longitud, vacío y un solo medio', () => {
    const v = (text: string) => variant({ network: 'linkedin', kind: 'article', text, extra: {} })
    expect(connector.validate(v(''), []).some((i) => i.level === 'error')).toBe(true)
    expect(connector.validate(v('x'.repeat(3001)), []).some((i) => i.level === 'error')).toBe(true)
    expect(connector.validate(v('Hola'), [])).toEqual([])
    const two = connector.validate(v('Hola'), [
      asset({ kind: 'image', mime: 'image/png' }),
      asset()
    ])
    expect(two.some((i) => i.message.includes('un solo medio'))).toBe(true)
  })

  it('publica texto con las cabeceras de versión y devuelve el id del post', async () => {
    const calls = stubFetch([
      ({ url }) =>
        url.endsWith('/rest/posts')
          ? new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:1' } })
          : undefined
    ])
    const result = await connector.publish({
      account: account({ network: 'linkedin', externalId: 'abc' }),
      accessToken: 'tok',
      variant: variant({ network: 'linkedin', kind: 'article', text: 'Hola (todos)' }),
      media: []
    })
    expect(result.externalPostId).toBe('urn:li:share:1')
    expect(result.externalUrl).toBe('https://www.linkedin.com/feed/update/urn:li:share:1/')
    const init = calls[0]!.init
    expect(header(init, 'Linkedin-Version')).toMatch(/^\d{6}$/)
    expect(header(init, 'X-Restli-Protocol-Version')).toBe('2.0.0')
    const body = JSON.parse(String(init.body))
    expect(body.author).toBe('urn:li:person:abc')
    expect(body.commentary).toBe('Hola \\(todos\\)')
    expect(body.content).toBeUndefined()
  })

  it('sube una imagen (registro, bytes, post con su URN y texto alternativo)', async () => {
    const calls = stubFetch([
      ({ url }) =>
        url.includes('/rest/images?action=initializeUpload')
          ? json({ value: { uploadUrl: 'https://upload.li/u', image: 'urn:li:image:9' } })
          : undefined,
      ({ url }) =>
        url === 'https://upload.li/u' ? new Response(null, { status: 201 }) : undefined,
      ({ url }) =>
        url.endsWith('/rest/posts')
          ? new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:2' } })
          : undefined
    ])
    await connector.publish({
      account: account({ network: 'linkedin', externalId: 'abc' }),
      accessToken: 'tok',
      variant: variant({ network: 'linkedin', kind: 'article' }),
      media: [
        {
          asset: asset({ kind: 'image', mime: 'image/jpeg', altText: 'Una foto' }),
          publicUrl: '',
          filePath: file
        }
      ]
    })
    expect(calls).toHaveLength(3)
    expect(calls[1]!.init.method).toBe('PUT')
    const post = JSON.parse(String(calls[2]!.init.body))
    expect(post.content.media).toEqual({ id: 'urn:li:image:9', altText: 'Una foto' })
  })

  it('no se puede renovar sin volver a autorizar', async () => {
    await expect(connector.refreshToken()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('X', () => {
  const connector = new XConnector(() => ({ clientId: 'id', clientSecret: '' }))
  const v = (text: string) => variant({ network: 'x', kind: 'thread', text, extra: {} })

  it('avisa del coste de los enlaces y de pasar de 280 caracteres', () => {
    expect(
      connector.validate(v('Mira https://ejemplo.com'), []).some((i) => i.message.includes('0,20'))
    ).toBe(true)
    const long = connector.validate(v('x'.repeat(300)), [])
    expect(long.some((i) => i.level === 'warning')).toBe(true)
    expect(long.some((i) => i.level === 'error')).toBe(false)
    expect(connector.validate(v('x'.repeat(4001)), []).some((i) => i.level === 'error')).toBe(true)
    expect(connector.validate(v(''), []).some((i) => i.level === 'error')).toBe(true)
  })

  it('no deja mezclar vídeo con fotos ni pasar de cuatro fotos', () => {
    const img = (n: string) =>
      asset({ kind: 'image', mime: 'image/jpeg', originalName: n, sizeBytes: 1000 })
    const mixed = connector.validate(v('Hola'), [asset(), img('a')])
    expect(mixed.some((i) => i.message.includes('mezclar'))).toBe(true)
    const five = connector.validate(v('Hola'), [img('1'), img('2'), img('3'), img('4'), img('5')])
    expect(five.some((i) => i.message.includes('4 fotos'))).toBe(true)
  })

  it('elige la categoría de medio correcta', () => {
    expect(mediaCategory(asset({ kind: 'image', mime: 'image/png' }))).toBe('tweet_image')
    expect(mediaCategory(asset({ kind: 'image', mime: 'image/gif' }))).toBe('tweet_gif')
    expect(mediaCategory(asset())).toBe('tweet_video')
  })

  it('sube el medio por fragmentos y publica con su id', async () => {
    const calls = stubFetch([
      ({ url }) =>
        url.endsWith('/2/media/upload/initialize') ? json({ data: { id: 'm1' } }) : undefined,
      ({ url }) =>
        url.endsWith('/2/media/upload/m1/append') ? new Response(null, { status: 204 }) : undefined,
      ({ url }) =>
        url.endsWith('/2/media/upload/m1/finalize') ? json({ data: { id: 'm1' } }) : undefined,
      ({ url }) => (url.endsWith('/2/tweets') ? json({ data: { id: 't1' } }, 201) : undefined)
    ])
    const result = await connector.publish({
      account: account({ network: 'x', username: 'yo' }),
      accessToken: 'tok',
      variant: v('Hola'),
      media: [{ asset: asset({ kind: 'image', mime: 'image/png' }), publicUrl: '', filePath: file }]
    })
    expect(result.externalUrl).toBe('https://x.com/yo/status/t1')
    const init = JSON.parse(String(calls[0]!.init.body))
    expect(init).toMatchObject({
      media_type: 'image/png',
      total_bytes: 2000,
      media_category: 'tweet_image'
    })
    const tweet = JSON.parse(String(calls.at(-1)!.init.body))
    expect(tweet).toEqual({ text: 'Hola', media: { media_ids: ['m1'] } })
  })

  it('espera al procesado del vídeo hasta que termina', async () => {
    let polls = 0
    stubFetch([
      ({ url }) => (url.endsWith('/initialize') ? json({ data: { id: 'm2' } }) : undefined),
      ({ url }) => (url.endsWith('/append') ? new Response(null, { status: 204 }) : undefined),
      ({ url }) =>
        url.endsWith('/finalize')
          ? json({ data: { id: 'm2', processing_info: { state: 'pending', check_after_secs: 1 } } })
          : undefined,
      ({ url }) => {
        if (!url.includes('command=STATUS')) return undefined
        polls++
        return json({
          data: { processing_info: { state: polls < 2 ? 'in_progress' : 'succeeded' } }
        })
      },
      ({ url }) => (url.endsWith('/2/tweets') ? json({ data: { id: 't2' } }, 201) : undefined)
    ])
    const result = await connector.publish({
      account: account({ network: 'x', username: 'yo' }),
      accessToken: 'tok',
      variant: v(''),
      media: [{ asset: asset(), publicUrl: '', filePath: file }]
    })
    expect(polls).toBe(2)
    expect(result.externalPostId).toBe('t2')
  })

  it('traduce el error de falta de saldo', async () => {
    stubFetch([
      () =>
        new Response(JSON.stringify({ title: 'CreditsDepleted', detail: 'No credits' }), {
          status: 402
        })
    ])
    await expect(
      connector.publish({
        account: account({ network: 'x' }),
        accessToken: 't',
        variant: v('Hola'),
        media: []
      })
    ).rejects.toThrow(/saldo|créditos/)
  })
})

describe('AccountsService con acceso de corta duración', () => {
  class FakeRepo {
    row: Account | null = null
    keyOf = ''
    upsert(input: Record<string, unknown>) {
      this.keyOf = String(input['secretKey'])
      this.row = account({
        network: input['network'] as Account['network'],
        externalId: String(input['externalId']),
        tokenExpiresAt: (input['tokenExpiresAt'] as string | null) ?? null,
        meta: input['meta'] as Record<string, unknown>
      })
      return this.row
    }
    get() {
      return this.row!
    }
    list() {
      return this.row ? [this.row] : []
    }
    update(_id: string, patch: Partial<Account>) {
      this.row = { ...this.row!, ...patch }
      return this.row
    }
    delete() {
      this.row = null
    }
    secretKeyOf() {
      return this.keyOf
    }
  }

  function setup(network: Account['network'] = 'youtube', autoRefresh = true) {
    const repo = new FakeRepo()
    const store = new Map<string, string>()
    const secrets = {
      get: (k: string) => store.get(k) ?? null,
      set: (k: string, v: string) => void store.set(k, v),
      delete: (k: string) => void store.delete(k),
      has: (k: string) => store.has(k)
    }
    const connector = {
      network,
      capabilities: () => ({ ...YOUTUBE_CAPABILITIES, network, autoRefresh }),
      identify: vi.fn(async () => ({
        externalId: 'UC1',
        username: 'yo',
        displayName: 'Yo',
        avatarUrl: null,
        accountType: 'canal',
        scopes: [],
        tokenExpiresAt: null,
        meta: { followersCount: 5 }
      })),
      refreshToken: vi.fn(async () => ({
        accessToken: 'a2',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        refreshToken: null
      })),
      validate: () => [],
      publish: vi.fn()
    } as unknown as Connector
    const future = new Date(Date.now() + 3_600_000).toISOString()
    const service = new AccountsService(
      repo as unknown as AccountsRepository,
      secrets as never,
      new ConnectorRegistry([connector]),
      vi.fn(),
      {
        [network]: async () => ({
          accessToken: 'a1',
          refreshToken: 'r1',
          expiresAt: future,
          scopes: ['s']
        })
      }
    )
    return { service, repo, store, connector }
  }

  it('guarda el acceso y el refresh token cifrados y no fija caducidad de cuenta', async () => {
    const { service, store } = setup()
    const connected = await service.connectOAuth('youtube', { clientId: 'id', clientSecret: '' })
    expect(store.get('account.youtube.UC1')).toBe('a1')
    expect(store.get('account.youtube.UC1.refresh')).toBe('r1')
    expect(connected.tokenExpiresAt).toBeNull()
    expect(typeof connected.meta['accessExpiresAt']).toBe('string')
  })

  it('renueva solo cuando el acceso está a punto de caducar', async () => {
    const { service, repo, store, connector } = setup()
    await service.connectOAuth('youtube', { clientId: 'id', clientSecret: '' })
    expect(await service.freshToken('acc1')).toBe('a1')
    expect(connector.refreshToken).not.toHaveBeenCalled()

    repo.update('acc1', {
      meta: { ...repo.row!.meta, accessExpiresAt: new Date(Date.now() - 1000).toISOString() }
    })
    expect(await service.freshToken('acc1')).toBe('a2')
    expect(connector.refreshToken).toHaveBeenCalledWith('a1', 'r1')
    expect(store.get('account.youtube.UC1.refresh')).toBe('r1') // se conserva si la red no da uno nuevo
    expect(connector.identify).toHaveBeenCalledTimes(1) // la renovación no vuelve a consultar la identidad
  })

  it('guarda el refresh token nuevo cuando la red lo rota', async () => {
    const { service, repo, store, connector } = setup()
    await service.connectOAuth('youtube', { clientId: 'id', clientSecret: '' })
    ;(connector.refreshToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      accessToken: 'a3',
      expiresAt: null,
      refreshToken: 'r2'
    })
    repo.update('acc1', {
      meta: { ...repo.row!.meta, accessExpiresAt: new Date(Date.now() - 1000).toISOString() }
    })
    await service.freshToken('acc1')
    expect(store.get('account.youtube.UC1.refresh')).toBe('r2')
  })

  it('no intenta renovar a diario las redes que exigen volver a autorizar', async () => {
    const { service, repo, connector } = setup('youtube', false)
    await service.connectOAuth('youtube', { clientId: 'id', clientSecret: '' })
    repo.update('acc1', { tokenExpiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString() })
    await service.refreshExpiring()
    expect(connector.refreshToken).not.toHaveBeenCalled()
  })

  it('al desconectar borra también el refresh token', async () => {
    const { service, store } = setup()
    await service.connectOAuth('youtube', { clientId: 'id', clientSecret: '' })
    service.disconnect('acc1')
    expect([...store.keys()]).toEqual([])
  })
})
