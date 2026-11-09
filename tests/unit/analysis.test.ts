import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import {
  EMPTY_PROFILE_DATA,
  PlanRequestSchema,
  ProfileCreateSchema,
  ProfileDataSchema,
  autoSourceFor,
  nextMondayKey,
  normalizeUsername,
  parseCountInput,
  planItemDate,
  type Analysis,
  type AuditResult,
  type PlanResult,
  type Profile,
  type ProfileCreate,
  type ProfileData,
  type Snapshot,
  type SnapshotSource
} from '@shared/domain/analysis'
import { NETWORK_META, kindLabel } from '@shared/connectors/networks'
import type { AnalyticsOverview, RemoteMedia } from '@shared/domain/analytics'
import type { Account } from '@shared/domain/accounts'
import type { PostCreate } from '@shared/domain/posts'
import { AppError } from '@shared/domain/errors'
import {
  AnalysisService,
  planCombos,
  sanitizePlan,
  type AnalysisCreate,
  type AnalysisStore
} from '@main/services/analysis.service'
import { instagramFormat, instagramProfileData } from '@main/services/analysis.sources'
import {
  fetchYoutubePublicProfile,
  parseIsoDuration
} from '@main/connectors/youtube/youtube.public'
import {
  buildAuditPrompt,
  buildPlanPrompt,
  buildScreenshotsPrompt,
  describeProfileData
} from '@main/ai/prompts'
import { exportFileNames, exportPostMedia, safeFileStem } from '@main/services/export'
import { AiService } from '@main/ai/ai.service'
import type { AiRepository, UsageCreate } from '@main/repositories/ai.repository'
import { SettingsService } from '@main/services/settings.service'
import { InMemorySettingsRepository } from '@main/repositories/settings.repository'
import { InMemorySecretStore, SECRET_KEYS } from '@main/secrets/secrets.service'

// ------------------------------------------------------------- datos de prueba

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 'p1',
  network: 'instagram',
  username: 'pepe',
  displayName: '',
  isOwn: true,
  accountId: null,
  notes: '',
  createdAt: 'now',
  updatedAt: 'now',
  ...over
})

const data = (over: Partial<ProfileData> = {}): ProfileData => ({
  ...EMPTY_PROFILE_DATA,
  followers: 12_345,
  posts: [
    {
      format: 'reel',
      publishedAt: '2026-11-01',
      caption: 'Cómo hacer pan',
      views: 25_000,
      likes: 900,
      comments: 40,
      shares: null,
      saves: 120,
      url: null
    }
  ],
  ...over
})

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  id: 's1',
  profileId: 'p1',
  source: 'screenshots',
  capturedAt: '2026-11-09T10:00:00.000Z',
  data: data(),
  createdAt: 'now',
  updatedAt: 'now',
  ...over
})

const audit: AuditResult = {
  headline: 'Los reels tiran del alcance',
  strengths: ['Reels con 25.000 vistas'],
  weaknesses: ['Pocos carruseles'],
  bestFormats: [{ format: 'reel', why: 'más alcance' }],
  topPosts: [{ post: 'Cómo hacer pan', why: 'gancho claro' }],
  recommendations: ['Publicar 3 reels por semana'],
  suggestedFrequency: [
    { network: 'instagram', kind: 'reel', perWeek: 3 },
    // Combinación imposible: debe descartarse.
    { network: 'x', kind: 'reel', perWeek: 2 }
  ],
  dataGaps: []
}

const planItem = (
  over: Partial<PlanResult['items'][number]> = {}
): PlanResult['items'][number] => ({
  dayOffset: 0,
  time: '10:00',
  network: 'instagram',
  kind: 'reel',
  title: 'Pan en 3 pasos',
  hook: 'Nadie te cuenta esto del pan',
  outline: 'Tres errores al amasar.',
  caption: 'Guárdalo para tu próxima hornada #pan',
  production: 'Plano cenital de las manos',
  pillar: 'Recetas',
  ...over
})

// ------------------------------------------------------------- funciones puras

describe('análisis · funciones puras', () => {
  it('normaliza el nombre de usuario aunque se pegue con @ o como enlace', () => {
    expect(normalizeUsername('  @pepe ')).toBe('pepe')
    expect(normalizeUsername('https://www.instagram.com/pepe/')).toBe('pepe')
    expect(normalizeUsername('https://www.youtube.com/@canal')).toBe('canal')
    expect(normalizeUsername('https://www.tiktok.com/@user?lang=es')).toBe('user')
    expect(normalizeUsername('https://www.linkedin.com/in/ana-lopez/')).toBe('ana-lopez')
    expect(ProfileCreateSchema.safeParse({ network: 'x', username: '@' }).success).toBe(false)
    expect(ProfileCreateSchema.parse({ network: 'tiktok', username: '@yo' })).toMatchObject({
      username: 'yo',
      isOwn: true,
      accountId: null
    })
  })

  it('lee cifras escritas a la española', () => {
    expect(parseCountInput('12.345')).toBe(12_345)
    expect(parseCountInput('1.234.567')).toBe(1_234_567)
    expect(parseCountInput('1,5')).toBe(1.5)
    expect(parseCountInput('12 300')).toBe(12_300)
    expect(parseCountInput('  ')).toBeNull()
    expect(parseCountInput('mucho')).toBe('invalid')
  })

  it('calcula la fecha de cada pieza del plan en hora local', () => {
    const d = planItemDate('2026-11-16', 2, '18:30', 14)
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2026, 10, 18, 18, 30
    ])
    const fallback = planItemDate('2026-11-16', 0, 'por la tarde', 7)
    expect(fallback.getHours()).toBe(10)
    expect(planItemDate('2026-11-16', 99, '09:00', 7).getDate()).toBe(22)
  })

  it('propone empezar el lunes siguiente', () => {
    expect(nextMondayKey(new Date(2026, 10, 9))).toBe('2026-11-16') // lunes → el siguiente
    expect(nextMondayKey(new Date(2026, 10, 15))).toBe('2026-11-16') // domingo
    expect(nextMondayKey(new Date(2026, 10, 11))).toBe('2026-11-16') // miércoles
  })

  it('solo YouTube y la Instagram propia conectada tienen datos automáticos gratis', () => {
    expect(autoSourceFor({ network: 'youtube', accountId: null })).toBe('youtube')
    expect(autoSourceFor({ network: 'instagram', accountId: null })).toBeNull()
    expect(autoSourceFor({ network: 'instagram', accountId: 'a1' })).toBe('instagram')
    expect(autoSourceFor({ network: 'tiktok', accountId: null })).toBeNull()
    expect(autoSourceFor({ network: 'x', accountId: null })).toBeNull()
  })

  it('TikTok es una red más, con sus propios nombres de formato', () => {
    expect(NETWORK_META.tiktok.kinds).toContain(NETWORK_META.tiktok.defaultKind)
    expect(kindLabel('tiktok', 'short')).toBe('Vídeo')
    expect(kindLabel('youtube', 'short')).toBe('Short')
  })

  it('combina redes y formatos que existen de verdad', () => {
    expect(planCombos(['instagram', 'x', 'instagram'], ['reel', 'thread', 'video'])).toEqual([
      { network: 'instagram', kinds: ['reel'] },
      { network: 'x', kinds: ['thread'] }
    ])
    expect(planCombos(['linkedin'], ['reel'])).toEqual([])
  })

  it('limpia el plan: fuera redes no pedidas, formatos corregidos, días acotados y ordenado', () => {
    const clean = sanitizePlan(
      {
        summary: 'x',
        items: [
          planItem({ dayOffset: 30, title: 'tarde' }),
          planItem({ network: 'x', kind: 'thread', title: 'fuera' }),
          planItem({ kind: 'video', dayOffset: 1, title: 'formato raro' }),
          planItem({ dayOffset: -3, time: '09:00', title: 'primero' })
        ]
      },
      { weeks: 1 },
      [{ network: 'instagram', kinds: ['reel', 'story'] }]
    )
    expect(clean.items.map((i) => i.title)).toEqual(['primero', 'formato raro', 'tarde'])
    expect(clean.items[1]?.kind).toBe('reel')
    expect(clean.items[2]?.dayOffset).toBe(6)
  })

  it('la duración de YouTube se convierte a segundos', () => {
    expect(parseIsoDuration('PT1M5S')).toBe(65)
    expect(parseIsoDuration('PT2H')).toBe(7200)
    expect(parseIsoDuration('P1DT1S')).toBe(86_401)
    expect(parseIsoDuration('nada')).toBeNull()
    expect(parseIsoDuration(undefined)).toBeNull()
  })

  it('nombres de archivo seguros para guardar los medios', () => {
    expect(safeFileStem('a/b: c*? "d"')).toBe('a b c d')
    expect(safeFileStem('...')).toBe('publicacion')
    const post = { title: 'Mi reel', scheduledAt: '2026-11-18T09:00:00.000Z' }
    expect(exportFileNames(post, [{ fileName: 'x.MP4', originalName: 'v.mp4' }])).toEqual([
      '2026-11-18 Mi reel.mp4'
    ])
    expect(
      exportFileNames(post, [
        { fileName: 'a.jpg', originalName: 'a.jpg' },
        { fileName: 'b.png', originalName: 'b.png' }
      ])
    ).toEqual(['2026-11-18 Mi reel 1.jpg', '2026-11-18 Mi reel 2.png'])
  })
})

// ------------------------------------------------------------- textos para Claude

describe('análisis · prompts', () => {
  it('las capturas son datos, no instrucciones', () => {
    const prompt = buildScreenshotsPrompt(profile(), 3)
    expect(prompt).toContain('3 capturas')
    expect(prompt).toContain('@pepe en Instagram')
    expect(prompt).toContain('no instrucciones')
    expect(prompt).toContain('pon null')
  })

  it('describe los datos de forma compacta y marca lo que falta', () => {
    const text = describeProfileData(data(), {
      capturedAt: '2026-11-09T10:00:00Z',
      source: 'manual'
    })
    expect(text).toContain('Datos del 2026-11-09 (origen: A mano)')
    expect(text).toContain('Seguidores: 12.345')
    expect(text).toContain('Siguiendo: sin dato')
    expect(text).toContain('reel · 2026-11-01 · «Cómo hacer pan» · vistas 25.000')
    expect(text).not.toContain('compartidos')
  })

  it('el análisis compara con la lectura anterior y lista las combinaciones válidas', () => {
    const prompt = buildAuditPrompt(
      profile({ isOwn: false }),
      snapshot(),
      snapshot({ id: 's0', capturedAt: '2026-10-01T10:00:00Z', data: data({ followers: 10_000 }) }),
      'quiero crecer'
    )
    expect(prompt).toContain('Datos anteriores')
    expect(prompt).toContain('Seguidores: 10.000')
    expect(prompt).toContain('cuenta de referencia')
    expect(prompt).toContain('TikTok (tiktok): short = vídeo')
    expect(prompt).toContain('quiero crecer')
  })

  it('el plan fija fechas, ritmo y solo las combinaciones pedidas', () => {
    const request = PlanRequestSchema.parse({
      profileId: 'p1',
      startDate: '2026-11-16',
      weeks: 2,
      networks: ['instagram'],
      kinds: ['reel', 'story'],
      perWeek: 4
    })
    const prompt = buildPlanPrompt({
      profile: profile(),
      latest: null,
      audit,
      request,
      combos: planCombos(request.networks, request.kinds),
      pillars: ['Recetas']
    })
    expect(prompt).toContain('Dura 14 días y empieza el lunes, 16 de noviembre de 2026')
    expect(prompt).toContain('el último es 13')
    expect(prompt).toContain('Unas 4 piezas por semana')
    expect(prompt).toContain('Instagram (instagram): reel')
    expect(prompt).not.toContain('YouTube (youtube)')
    expect(prompt).toContain('No hay datos de la cuenta')
    expect(prompt).toContain('Los reels tiran del alcance')
    expect(prompt).toContain('Recetas')
  })
})

// ------------------------------------------------------------- fuentes automáticas

describe('análisis · fuentes automáticas', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const media = (over: Partial<RemoteMedia>): RemoteMedia => ({
    id: 'r1',
    accountId: 'a1',
    externalId: 'ig1',
    mediaType: 'VIDEO',
    productType: 'REELS',
    caption: 'Pan casero',
    permalink: 'https://www.instagram.com/reel/1',
    thumbnailUrl: null,
    publishedAt: '2026-11-02T10:00:00+0000',
    likeCount: 50,
    commentsCount: 4,
    postId: null,
    insights: { views: 3000, saved: 12 },
    ...over
  })

  it('convierte la analítica de Instagram en datos de análisis', () => {
    const overview = {
      accountId: 'a1',
      days: 30,
      from: '',
      to: '',
      lastSyncAt: null,
      lastError: null,
      unavailable: ['profile_links_taps'],
      stats: [
        {
          metric: 'followers_count',
          label: 'Seguidores',
          value: 1500,
          change: 0.1,
          available: true
        },
        { metric: 'reach', label: 'Alcance', value: 9000, change: -0.25, available: true },
        { metric: 'shares', label: 'Compartidos', value: 0, change: null, available: false }
      ],
      series: {},
      topMedia: [],
      recentMedia: [
        media({}),
        media({ id: 'r2', mediaType: 'CAROUSEL_ALBUM', productType: 'FEED' })
      ]
    } satisfies AnalyticsOverview
    const account = { displayName: 'Pepe', meta: { mediaCount: 80 } } as unknown as Account
    const result = instagramProfileData(overview, account)
    expect(result.followers).toBe(1500)
    expect(result.postsCount).toBe(80)
    expect(result.metrics).toEqual([
      { label: 'Alcance', value: 9000, note: '-25 % frente al periodo anterior' }
    ])
    expect(result.posts[0]).toMatchObject({ format: 'reel', views: 3000, saves: 12, shares: null })
    expect(result.posts[1]?.format).toBe('carrusel')
    expect(result.observations).toContain('profile_links_taps')
    expect(instagramFormat({ mediaType: 'IMAGE', productType: 'FEED' })).toBe('foto')
  })

  const respond = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status })

  it('lee los datos públicos de un canal de YouTube con la clave de API', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        if (url.includes('/channels?'))
          return respond({
            items: [
              {
                id: 'UC1',
                snippet: { title: 'Canal de pan', description: 'Recetas' },
                statistics: { subscriberCount: '2500', videoCount: '40', viewCount: '100000' },
                contentDetails: { relatedPlaylists: { uploads: 'UU1' } }
              }
            ]
          })
        if (url.includes('/playlistItems?'))
          return respond({
            items: [{ contentDetails: { videoId: 'v1' } }, { contentDetails: { videoId: 'v2' } }]
          })
        return respond({
          items: [
            {
              id: 'v1',
              snippet: { title: 'Short de pan', publishedAt: '2026-11-03T10:00:00Z' },
              statistics: { viewCount: '5000', likeCount: '200', commentCount: '10' },
              contentDetails: { duration: 'PT45S' }
            },
            {
              id: 'v2',
              snippet: { title: 'Masa madre a fondo', publishedAt: '2026-10-20T10:00:00Z' },
              statistics: { viewCount: '1200' },
              contentDetails: { duration: 'PT12M30S' }
            }
          ]
        })
      })
    )
    const result = await fetchYoutubePublicProfile('CLAVE-SECRETA', 'canaldepan')
    expect(urls[0]).toContain('forHandle=%40canaldepan')
    expect(urls[2]).toContain('id=v1%2Cv2')
    expect(result.followers).toBe(2500)
    expect(result.postsCount).toBe(40)
    expect(result.metrics[0]).toMatchObject({ value: 100_000 })
    expect(result.posts[0]).toMatchObject({
      format: 'vídeo corto de 45 s (posible Short)',
      views: 5000,
      likes: 200,
      publishedAt: '2026-11-03',
      url: 'https://www.youtube.com/watch?v=v1'
    })
    expect(result.posts[1]).toMatchObject({ format: 'vídeo de 13 min', likes: null })
  })

  it('YouTube: canal inexistente, suscriptores ocultos y clave inválida sin filtrarla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond({ items: [] }))
    )
    await expect(fetchYoutubePublicProfile('k', 'nadie')).rejects.toMatchObject({
      code: 'NOT_FOUND'
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/channels?')
          ? respond({ items: [{ id: 'UC1', statistics: { hiddenSubscriberCount: true } }] })
          : respond({ items: [] })
      )
    )
    const hidden = await fetchYoutubePublicProfile('k', 'oculto')
    expect(hidden.followers).toBeNull()
    expect(hidden.observations).toContain('oculta')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond({ error: { message: 'API key not valid.' } }, 400))
    )
    const error = await fetchYoutubePublicProfile('CLAVE-SECRETA', 'x').catch((e: AppError) => e)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).message).toContain('API key not valid')
    expect((error as AppError).message).not.toContain('CLAVE-SECRETA')
  })
})

// ------------------------------------------------------------- servicio

class MemoryStore implements AnalysisStore {
  profiles: Profile[] = []
  snapshots: Snapshot[] = []
  analyses: Analysis[] = []
  private n = 0
  private id(prefix: string): string {
    return `${prefix}${++this.n}`
  }
  listProfiles(): Profile[] {
    return this.profiles
  }
  getProfile(id: string): Profile {
    const p = this.profiles.find((x) => x.id === id)
    if (!p) throw new AppError('NOT_FOUND', 'no existe')
    return p
  }
  createProfile(input: ProfileCreate): Profile {
    const p: Profile = { ...input, id: this.id('p'), createdAt: 'now', updatedAt: 'now' }
    this.profiles.push(p)
    return p
  }
  updateProfile(id: string, patch: Partial<ProfileCreate>): Profile {
    const p = { ...this.getProfile(id), ...patch }
    this.profiles = this.profiles.map((x) => (x.id === id ? p : x))
    return p
  }
  deleteProfile(id: string): void {
    this.profiles = this.profiles.filter((x) => x.id !== id)
  }
  listSnapshots(profileId: string): Snapshot[] {
    return this.snapshots
      .filter((s) => s.profileId === profileId)
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
  }
  addSnapshot(input: {
    profileId: string
    source: SnapshotSource
    data: ProfileData
    capturedAt: string
  }): Snapshot {
    const s: Snapshot = { ...input, id: this.id('s'), createdAt: 'now', updatedAt: 'now' }
    this.snapshots.push(s)
    return s
  }
  deleteSnapshot(id: string): void {
    this.snapshots = this.snapshots.filter((s) => s.id !== id)
  }
  listAnalyses(profileId: string): Analysis[] {
    return this.analyses.filter((a) => a.profileId === profileId).reverse()
  }
  getAnalysis(id: string): Analysis {
    const a = this.analyses.find((x) => x.id === id)
    if (!a) throw new AppError('NOT_FOUND', 'no existe')
    return a
  }
  addAnalysis(input: AnalysisCreate): Analysis {
    const base = { id: this.id('a'), createdAt: '2026-11-09T10:00:00.000Z', updatedAt: 'now' }
    const a: Analysis =
      input.kind === 'plan' ? { ...input, ...base, applied: {} } : { ...input, ...base }
    this.analyses.push(a)
    return a
  }
  setApplied(id: string, applied: Record<string, string>): Analysis {
    const a = this.getAnalysis(id)
    if (a.kind !== 'plan') throw new Error('no es un plan')
    const next = { ...a, applied }
    this.analyses = this.analyses.map((x) => (x.id === id ? next : x))
    return next
  }
  deleteAnalysis(id: string): void {
    this.analyses = this.analyses.filter((a) => a.id !== id)
  }
}

function setup(options: { plan?: PlanResult; youtubeKey?: string | null } = {}): {
  service: AnalysisService
  store: MemoryStore
  generate: ReturnType<typeof vi.fn>
  posts: PostCreate[]
  loadImage: ReturnType<typeof vi.fn>
  fetchYoutube: ReturnType<typeof vi.fn>
  instagramData: ReturnType<typeof vi.fn>
} {
  const store = new MemoryStore()
  const posts: PostCreate[] = []
  const responses: Record<string, unknown> = {
    profile_read: data({ followers: 999 }),
    profile_audit: audit,
    profile_plan: options.plan ?? { summary: 'Plan', items: [planItem()] }
  }
  const generate = vi.fn(async (input: { kind: string }) => ({
    result: responses[input.kind],
    model: 'claude-opus-5-5',
    costUsd: 0.02
  }))
  const loadImage = vi.fn(async () => ({ mediaType: 'image/jpeg' as const, base64: 'AAAA' }))
  const fetchYoutube = vi.fn(async () => data({ followers: 2500 }))
  const instagramData = vi.fn(async () => data({ followers: 1500 }))
  const service = new AnalysisService({
    store,
    ai: { generate } as unknown as Pick<AiService, 'generate'>,
    loadImage,
    createPost: (input) => {
      posts.push(input)
      return { post: { id: `post${posts.length}` } }
    },
    pillars: () => [{ id: 'pil1', name: 'Recetas' }],
    youtubeApiKey: () => (options.youtubeKey === undefined ? 'clave' : options.youtubeKey),
    fetchYoutube,
    instagramData,
    now: () => new Date('2026-11-09T10:00:00.000Z')
  })
  return { service, store, generate, posts, loadImage, fetchYoutube, instagramData }
}

describe('AnalysisService', () => {
  it('solo Instagram guarda la cuenta conectada', () => {
    const { service } = setup()
    const tiktok = service.createProfile(
      ProfileCreateSchema.parse({ network: 'tiktok', username: 'yo', accountId: 'a1' })
    )
    expect(tiktok.accountId).toBeNull()
    const ig = service.createProfile(
      ProfileCreateSchema.parse({ network: 'instagram', username: 'yo', accountId: 'a1' })
    )
    expect(ig.accountId).toBe('a1')
    expect(service.updateProfile(ig.id, { network: 'x' }).accountId).toBeNull()
  })

  it('lee capturas con Claude sin guardar nada hasta que el usuario revise', async () => {
    const { service, store, generate, loadImage } = setup()
    const p = service.createProfile(
      ProfileCreateSchema.parse({ network: 'instagram', username: 'pepe' })
    )
    const result = await service.readScreenshots(p.id, [
      'C:/capturas/uno.PNG',
      'C:/capturas/dos.jpg'
    ])
    expect(result).toEqual({ data: expect.objectContaining({ followers: 999 }), costUsd: 0.02 })
    expect(loadImage).toHaveBeenCalledTimes(2)
    const call = generate.mock.calls[0]![0] as { kind: string; images: unknown[]; prompt: string }
    expect(call.kind).toBe('profile_read')
    expect(call.images).toHaveLength(2)
    expect(call.prompt).toContain('2 capturas')
    expect(store.snapshots).toHaveLength(0)

    await expect(service.readScreenshots(p.id, ['C:/notas.pdf'])).rejects.toMatchObject({
      code: 'VALIDATION'
    })
    await expect(
      service.readScreenshots(
        p.id,
        Array.from({ length: 11 }, (_, i) => `c${i}.png`)
      )
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('el análisis exige datos y compara la última lectura con la anterior', async () => {
    const { service, generate } = setup()
    const p = service.createProfile(
      ProfileCreateSchema.parse({ network: 'instagram', username: 'pepe' })
    )
    await expect(service.audit(p.id, '')).rejects.toMatchObject({ code: 'VALIDATION' })

    service.saveSnapshot(p.id, 'manual', data({ followers: 10_000 }))
    const store = (service as unknown as { deps: { store: MemoryStore } }).deps.store
    store.snapshots[0]!.capturedAt = '2026-10-01T10:00:00.000Z'
    service.saveSnapshot(p.id, 'screenshots', data())
    const analysis = await service.audit(p.id, 'más ventas')
    expect(analysis.kind).toBe('audit')
    if (analysis.kind !== 'audit') return
    expect(analysis.result.suggestedFrequency).toEqual([
      { network: 'instagram', kind: 'reel', perWeek: 3 }
    ])
    const prompt = (generate.mock.calls[0]![0] as { prompt: string }).prompt
    expect(prompt).toContain('Datos anteriores')
    expect(prompt).toContain('más ventas')
  })

  it('datos automáticos: YouTube con clave, Instagram conectada y el resto con capturas', async () => {
    const noKey = setup({ youtubeKey: null })
    const yt = noKey.service.createProfile(
      ProfileCreateSchema.parse({ network: 'youtube', username: 'canal' })
    )
    await expect(noKey.service.refreshAuto(yt.id)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })

    const { service, fetchYoutube, instagramData } = setup()
    const yt2 = service.createProfile(
      ProfileCreateSchema.parse({ network: 'youtube', username: 'canal' })
    )
    const saved = await service.refreshAuto(yt2.id)
    expect(fetchYoutube).toHaveBeenCalledWith('clave', 'canal')
    expect(saved).toMatchObject({ source: 'youtube', data: { followers: 2500 } })

    const ig = service.createProfile(
      ProfileCreateSchema.parse({ network: 'instagram', username: 'yo', accountId: 'a1' })
    )
    expect(await service.refreshAuto(ig.id)).toMatchObject({ source: 'instagram' })
    expect(instagramData).toHaveBeenCalledWith('a1')

    const tt = service.createProfile(
      ProfileCreateSchema.parse({ network: 'tiktok', username: 'yo' })
    )
    await expect(service.refreshAuto(tt.id)).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('genera un plan, lo limpia y lo pasa al calendario sin duplicar', async () => {
    const { service, posts, generate } = setup({
      plan: {
        summary: 'Dos semanas de pan',
        items: [
          planItem({ dayOffset: 2, time: '18:30' }),
          planItem({ network: 'youtube', kind: 'short', title: 'Short de pan', pillar: null }),
          planItem({ network: 'x', kind: 'thread', title: 'No pedido' })
        ]
      }
    })
    const p = service.createProfile(
      ProfileCreateSchema.parse({ network: 'instagram', username: 'pepe' })
    )
    await expect(
      service.plan(
        PlanRequestSchema.parse({
          profileId: p.id,
          startDate: '2026-11-16',
          networks: ['linkedin'],
          kinds: ['reel']
        })
      )
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(generate).not.toHaveBeenCalled()

    const plan = await service.plan(
      PlanRequestSchema.parse({
        profileId: p.id,
        startDate: '2026-11-16',
        weeks: 2,
        networks: ['instagram', 'youtube'],
        kinds: ['reel', 'short']
      })
    )
    if (plan.kind !== 'plan') throw new Error('esperaba un plan')
    expect(plan.result.items.map((i) => i.title)).toEqual(['Short de pan', 'Pan en 3 pasos'])
    expect((generate.mock.calls[0]![0] as { maxTokens: number }).maxTokens).toBeGreaterThan(8000)

    const first = service.applyPlan(plan.id, [1, 0, 0])
    expect(first.created).toEqual(['post1', 'post2'])
    expect(posts[0]).toMatchObject({
      title: 'Short de pan',
      variants: [{ network: 'youtube', kind: 'short', extra: { title: 'Short de pan' } }]
    })
    const scheduled = new Date(posts[1]!.scheduledAt!)
    expect([scheduled.getDate(), scheduled.getHours(), scheduled.getMinutes()]).toEqual([
      18, 18, 30
    ])
    expect(posts[1]).toMatchObject({
      pillarId: 'pil1',
      body: expect.stringContaining('Nadie te cuenta')
    })
    expect(posts[1]!.notes).toContain('Plano cenital')

    const again = service.applyPlan(plan.id, [0, 1])
    expect(again.created).toEqual([])
    expect(posts).toHaveLength(2)
    if (again.analysis.kind === 'plan')
      expect(Object.keys(again.analysis.applied)).toEqual(['0', '1'])
  })

  it('un análisis no se puede pasar al calendario', async () => {
    const { service } = setup()
    const p = service.createProfile(
      ProfileCreateSchema.parse({ network: 'instagram', username: 'pepe' })
    )
    service.saveSnapshot(p.id, 'manual', data())
    const a = await service.audit(p.id, '')
    expect(() => service.applyPlan(a.id, [0])).toThrow(AppError)
  })
})

// ------------------------------------------------------------- llamada genérica con imágenes

describe('AiService.generate', () => {
  const usage = {
    input_tokens: 2000,
    output_tokens: 500,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0
  } as unknown as Anthropic.Beta.BetaUsage

  function make(response: Record<string, unknown>): {
    ai: AiService
    parse: ReturnType<typeof vi.fn>
    usageRows: UsageCreate[]
  } {
    const usageRows: UsageCreate[] = []
    const repo = {
      addUsage: (row: UsageCreate) => usageRows.push(row),
      usageForMonth: (month: string) => ({
        month,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0
      })
    } as unknown as AiRepository
    const secrets = new InMemorySecretStore()
    secrets.set(SECRET_KEYS.anthropicApiKey, 'sk-ant-prueba')
    const parse = vi.fn(async () => ({
      model: 'claude-opus-5-5',
      stop_reason: 'end_turn',
      stop_details: null,
      parsed_output: null,
      content: [],
      usage,
      ...response
    }))
    const client = { beta: { messages: { parse } } } as unknown as Anthropic
    const ai = new AiService({
      repo,
      secrets,
      settings: new SettingsService(new InMemorySettingsRepository()),
      emit: () => {},
      clientFactory: () => client
    })
    return { ai, parse, usageRows }
  }

  it('envía las imágenes antes del texto y registra el coste', async () => {
    const { ai, parse, usageRows } = make({ parsed_output: data() })
    const result = await ai.generate({
      kind: 'profile_read',
      schema: ProfileDataSchema,
      prompt: 'Lee esto',
      images: [{ mediaType: 'image/jpeg', base64: 'AAAA' }]
    })
    expect(result.result.followers).toBe(12_345)
    const params = parse.mock.calls[0]![0] as {
      messages: Array<{ content: Array<{ type: string }> }>
    }
    expect(params.messages[0]!.content.map((b) => b.type)).toEqual(['image', 'text'])
    expect(usageRows[0]).toMatchObject({ kind: 'profile_read', inputTokens: 2000 })
    expect(result.costUsd).toBeGreaterThan(0)
  })

  it('rechazos, respuestas cortadas y sin formato dan errores claros', async () => {
    const input = { kind: 'profile_plan', schema: ProfileDataSchema, prompt: 'x' }
    await expect(make({ stop_reason: 'refusal' }).ai.generate(input)).rejects.toMatchObject({
      code: 'REFUSED'
    })
    await expect(make({ stop_reason: 'max_tokens' }).ai.generate(input)).rejects.toMatchObject({
      message: expect.stringContaining('demasiado larga')
    })
    await expect(make({}).ai.generate(input)).rejects.toMatchObject({ code: 'EXTERNAL_API' })
  })
})

// ------------------------------------------------------------- exportación de medios

describe('exportación de medios', () => {
  it('copia los archivos con nombre claro y nunca sobrescribe', async () => {
    const mediaDir = mkdtempSync(join(tmpdir(), 'rrss-media-'))
    const dest = mkdtempSync(join(tmpdir(), 'rrss-export-'))
    writeFileSync(join(mediaDir, 'abc.jpg'), 'imagen')
    const detail = {
      post: { title: 'Pan: paso a paso', scheduledAt: '2026-11-18T09:00:00.000Z' },
      media: [{ fileName: 'abc.jpg', originalName: 'foto.jpg' }]
    } as unknown as Parameters<typeof exportPostMedia>[0]
    await exportPostMedia(detail, mediaDir, dest)
    await exportPostMedia(detail, mediaDir, dest)
    expect(readdirSync(dest).sort()).toEqual([
      '2026-11-18 Pan paso a paso (2).jpg',
      '2026-11-18 Pan paso a paso.jpg'
    ])
    const missing = {
      ...detail,
      media: [{ fileName: 'no-existe.jpg', originalName: 'perdida.jpg' }]
    } as unknown as Parameters<typeof exportPostMedia>[0]
    await expect(exportPostMedia(missing, mediaDir, dest)).rejects.toMatchObject({
      code: 'IO',
      message: expect.stringContaining('perdida.jpg')
    })
  })
})
