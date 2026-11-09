import { NETWORK_META, type Network, type PostKind } from '@shared/connectors/networks'
import { AppError } from '@shared/domain/errors'
import { ScreenContextSchema, type ScreenContext } from '@shared/domain/ai'
import { PostCreateSchema, type PostCreate } from '@shared/domain/posts'
import {
  AuditResultSchema,
  MAX_SCREENSHOTS,
  PlanResultSchema,
  ProfileDataSchema,
  SCREENSHOT_EXTENSIONS,
  autoSourceFor,
  planItemDate,
  type Analysis,
  type AuditResult,
  type PlanRequest,
  type PlanResult,
  type Profile,
  type ProfileCreate,
  type ProfileData,
  type Snapshot,
  type SnapshotSource
} from '@shared/domain/analysis'
import type { AiService, GenerateImage } from '../ai/ai.service'
import { buildAuditPrompt, buildPlanPrompt, buildScreenshotsPrompt } from '../ai/prompts'
import { fetchYoutubePublicProfile } from '../connectors/youtube/youtube.public'

/** Claves en `secrets` de esta fase. */
export const ANALYSIS_SECRET_KEYS = {
  youtubeApiKey: 'youtube.apiKey'
} as const

/** Un plan de 4 semanas con textos completos necesita bastante salida. */
const PLAN_MAX_TOKENS = 16_000
const READ_MAX_TOKENS = 8_000

export type AnalysisCreate =
  | {
      kind: 'audit'
      profileId: string
      snapshotId: string | null
      instruction: string
      model: string
      costUsd: number
      result: AuditResult
    }
  | {
      kind: 'plan'
      profileId: string
      snapshotId: string | null
      instruction: string
      model: string
      costUsd: number
      result: PlanResult
      request: PlanRequest
    }

/** Almacén de cuentas analizadas, datos y análisis (SQLite en la app, memoria en tests). */
export interface AnalysisStore {
  listProfiles(): Profile[]
  getProfile(id: string): Profile
  createProfile(input: ProfileCreate): Profile
  updateProfile(id: string, patch: Partial<ProfileCreate>): Profile
  deleteProfile(id: string): void
  /** Del más reciente al más antiguo. */
  listSnapshots(profileId: string): Snapshot[]
  addSnapshot(input: {
    profileId: string
    source: SnapshotSource
    data: ProfileData
    capturedAt: string
  }): Snapshot
  deleteSnapshot(id: string): void
  /** Del más reciente al más antiguo. */
  listAnalyses(profileId: string): Analysis[]
  getAnalysis(id: string): Analysis
  addAnalysis(input: AnalysisCreate): Analysis
  setApplied(id: string, applied: Record<string, string>): Analysis
  deleteAnalysis(id: string): void
}

export interface AnalysisDeps {
  store: AnalysisStore
  ai: Pick<AiService, 'generate'>
  /** Lee una captura del disco y la prepara para Claude (Electron en la app). */
  loadImage: (path: string) => Promise<GenerateImage>
  /** Crea un borrador en el calendario (y sus avisos de publicación manual). */
  createPost: (input: PostCreate) => { post: { id: string } }
  pillars: () => Array<{ id: string; name: string }>
  youtubeApiKey: () => string | null
  fetchYoutube?: (apiKey: string, username: string) => Promise<ProfileData>
  /** Datos automáticos de la cuenta de Instagram conectada. */
  instagramData: (accountId: string) => Promise<ProfileData>
  now?: () => Date
}

/** Combinaciones red-formato que existen de verdad. Pura (probada). */
export function planCombos(
  networks: Network[],
  kinds: PostKind[]
): Array<{ network: Network; kinds: PostKind[] }> {
  return [...new Set(networks)]
    .map((network) => ({
      network,
      kinds: [...new Set(kinds)].filter((k) => NETWORK_META[network].kinds.includes(k))
    }))
    .filter((c) => c.kinds.length > 0)
}

/** Descarta o corrige lo que el modelo devuelva fuera de lo pedido. Pura (probada). */
export function sanitizePlan(
  result: PlanResult,
  request: Pick<PlanRequest, 'weeks'>,
  combos: Array<{ network: Network; kinds: PostKind[] }>
): PlanResult {
  const days = request.weeks * 7
  const items = result.items
    .filter((item) => combos.some((c) => c.network === item.network))
    .map((item) => {
      const combo = combos.find((c) => c.network === item.network)!
      const kind = combo.kinds.includes(item.kind) ? item.kind : combo.kinds[0]!
      const dayOffset = Math.min(Math.max(0, Math.round(item.dayOffset)), days - 1)
      return { ...item, kind, dayOffset }
    })
    .sort((a, b) => a.dayOffset - b.dayOffset || a.time.localeCompare(b.time))
  return { summary: result.summary, items }
}

export function sanitizeAudit(result: AuditResult): AuditResult {
  return {
    ...result,
    suggestedFrequency: result.suggestedFrequency.filter((f) =>
      NETWORK_META[f.network].kinds.includes(f.kind)
    )
  }
}

/**
 * Fase 9: analizar una cuenta (propia o de referencia), proponer un plan y pasarlo al
 * calendario como borradores. Nunca publica: la persona publica a mano.
 */
export class AnalysisService {
  constructor(private readonly deps: AnalysisDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date()
  }

  // ------------------------------------------------------------ cuentas

  listProfiles(): Profile[] {
    return this.deps.store.listProfiles()
  }

  createProfile(input: ProfileCreate): Profile {
    // Solo Instagram lee datos de una cuenta conectada.
    return this.deps.store.createProfile({
      ...input,
      accountId: input.network === 'instagram' ? input.accountId : null
    })
  }

  updateProfile(id: string, patch: Partial<ProfileCreate>): Profile {
    const current = this.deps.store.getProfile(id)
    const network = patch.network ?? current.network
    return this.deps.store.updateProfile(id, {
      ...patch,
      ...(network !== 'instagram' ? { accountId: null } : {})
    })
  }

  deleteProfile(id: string): void {
    this.deps.store.deleteProfile(id)
  }

  // ------------------------------------------------------------ datos

  listSnapshots(profileId: string): Snapshot[] {
    this.deps.store.getProfile(profileId)
    return this.deps.store.listSnapshots(profileId)
  }

  saveSnapshot(profileId: string, source: SnapshotSource, data: ProfileData): Snapshot {
    this.deps.store.getProfile(profileId)
    return this.deps.store.addSnapshot({
      profileId,
      source,
      data: ProfileDataSchema.parse(data),
      capturedAt: this.now().toISOString()
    })
  }

  deleteSnapshot(id: string): void {
    this.deps.store.deleteSnapshot(id)
  }

  /**
   * Claude lee las capturas y devuelve un borrador de datos. NO se guarda: la interfaz se
   * lo enseña al usuario para que lo revise y lo guarde con `saveSnapshot`.
   */
  async readScreenshots(
    profileId: string,
    paths: string[]
  ): Promise<{ data: ProfileData; costUsd: number }> {
    const profile = this.deps.store.getProfile(profileId)
    if (paths.length === 0) throw new AppError('VALIDATION', 'Elige al menos una captura.')
    if (paths.length > MAX_SCREENSHOTS) {
      throw new AppError('VALIDATION', `Como máximo ${MAX_SCREENSHOTS} capturas cada vez.`)
    }
    for (const path of paths) {
      const ext = path.split('.').pop()?.toLowerCase() ?? ''
      if (!(SCREENSHOT_EXTENSIONS as readonly string[]).includes(ext)) {
        const name = path.split(/[\\/]/).pop() ?? path
        throw new AppError('VALIDATION', `«${name}» no es una imagen PNG, JPG o WebP.`)
      }
    }
    const images: GenerateImage[] = []
    for (const path of paths) images.push(await this.deps.loadImage(path))
    const { result, costUsd } = await this.deps.ai.generate({
      kind: 'profile_read',
      schema: ProfileDataSchema,
      prompt: buildScreenshotsPrompt(profile, paths.length),
      images,
      context: this.context(),
      maxTokens: READ_MAX_TOKENS
    })
    return { data: result, costUsd }
  }

  /** Datos automáticos y gratuitos (YouTube público, Instagram propia conectada). */
  async refreshAuto(profileId: string): Promise<Snapshot> {
    const profile = this.deps.store.getProfile(profileId)
    const source = autoSourceFor(profile)
    if (source === 'youtube') {
      const apiKey = this.deps.youtubeApiKey()
      if (!apiKey) {
        throw new AppError(
          'NOT_CONFIGURED',
          'Falta la clave de API de YouTube. Añádela en Ajustes → Datos automáticos.'
        )
      }
      const fetchYoutube = this.deps.fetchYoutube ?? fetchYoutubePublicProfile
      const data = await fetchYoutube(apiKey, profile.username)
      return this.saveSnapshot(profileId, 'youtube', data)
    }
    if (source === 'instagram' && profile.accountId) {
      const data = await this.deps.instagramData(profile.accountId)
      return this.saveSnapshot(profileId, 'instagram', data)
    }
    throw new AppError(
      'VALIDATION',
      `${NETWORK_META[profile.network].label} no tiene datos automáticos gratuitos para esta cuenta. Usa capturas o escríbelos a mano.`
    )
  }

  // ------------------------------------------------------------ análisis y plan

  listAnalyses(profileId: string): Analysis[] {
    this.deps.store.getProfile(profileId)
    return this.deps.store.listAnalyses(profileId)
  }

  deleteAnalysis(id: string): void {
    this.deps.store.deleteAnalysis(id)
  }

  async audit(profileId: string, instruction: string): Promise<Analysis> {
    const profile = this.deps.store.getProfile(profileId)
    const [latest, previous] = this.deps.store.listSnapshots(profileId)
    if (!latest) {
      throw new AppError(
        'VALIDATION',
        'Primero añade datos de la cuenta: capturas, a mano o automáticos.'
      )
    }
    const { result, model, costUsd } = await this.deps.ai.generate({
      kind: 'profile_audit',
      schema: AuditResultSchema,
      prompt: buildAuditPrompt(profile, latest, previous ?? null, instruction),
      context: this.context()
    })
    return this.deps.store.addAnalysis({
      kind: 'audit',
      profileId,
      snapshotId: latest.id,
      instruction,
      model,
      costUsd,
      result: sanitizeAudit(result)
    })
  }

  async plan(request: PlanRequest): Promise<Analysis> {
    const profile = this.deps.store.getProfile(request.profileId)
    const combos = planCombos(request.networks, request.kinds)
    if (combos.length === 0) {
      throw new AppError(
        'VALIDATION',
        'Ninguno de los formatos elegidos existe en esas redes. Revisa la selección.'
      )
    }
    const latest = this.deps.store.listSnapshots(profile.id)[0] ?? null
    const lastAudit = this.deps.store.listAnalyses(profile.id).find((a) => a.kind === 'audit')
    const { result, model, costUsd } = await this.deps.ai.generate({
      kind: 'profile_plan',
      schema: PlanResultSchema,
      prompt: buildPlanPrompt({
        profile,
        latest,
        audit: lastAudit?.kind === 'audit' ? lastAudit.result : null,
        request,
        combos,
        pillars: this.deps.pillars().map((p) => p.name)
      }),
      context: this.context(),
      maxTokens: PLAN_MAX_TOKENS
    })
    const clean = sanitizePlan(result, request, combos)
    if (clean.items.length === 0) {
      throw new AppError(
        'EXTERNAL_API',
        'Claude no propuso ninguna pieza válida para esas redes y formatos. Vuelve a intentarlo.'
      )
    }
    return this.deps.store.addAnalysis({
      kind: 'plan',
      profileId: profile.id,
      snapshotId: latest?.id ?? null,
      instruction: request.instruction,
      model,
      costUsd,
      result: clean,
      request
    })
  }

  /**
   * Crea borradores programados en el calendario para las piezas elegidas. Las que ya se
   * crearon antes se saltan, así que pulsar dos veces no duplica nada.
   */
  applyPlan(analysisId: string, itemIndexes: number[]): { analysis: Analysis; created: string[] } {
    const analysis = this.deps.store.getAnalysis(analysisId)
    if (analysis.kind !== 'plan') {
      throw new AppError('VALIDATION', 'Solo un plan se puede pasar al calendario.')
    }
    const profile = this.deps.store.getProfile(analysis.profileId)
    const pillars = this.deps.pillars()
    const applied = { ...analysis.applied }
    const created: string[] = []
    const totalDays = analysis.request.weeks * 7
    const indexes = [...new Set(itemIndexes)].sort((a, b) => a - b)

    for (const index of indexes) {
      const item = analysis.result.items[index]
      if (!item || applied[String(index)]) continue
      const pillar = item.pillar
        ? pillars.find((p) => p.name.toLowerCase() === item.pillar!.toLowerCase())
        : undefined
      const input = PostCreateSchema.parse({
        title: item.title.trim().slice(0, 200) || `Pieza ${index + 1} del plan`,
        body: [item.hook, item.outline].filter(Boolean).join('\n\n').slice(0, 20_000),
        pillarId: pillar?.id ?? null,
        notes:
          `Cómo montarla: ${item.production}\n\nCreada desde el plan de @${profile.username} del ${analysis.createdAt.slice(0, 10)}.`.slice(
            0,
            10_000
          ),
        scheduledAt: planItemDate(
          analysis.request.startDate,
          item.dayOffset,
          item.time,
          totalDays
        ).toISOString(),
        variants: [
          {
            network: item.network,
            kind: item.kind,
            text: item.caption.slice(0, 20_000),
            extra: item.network === 'youtube' ? { title: item.title.slice(0, 100) } : {}
          }
        ]
      })
      const post = this.deps.createPost(input)
      applied[String(index)] = post.post.id
      created.push(post.post.id)
    }
    return { analysis: this.deps.store.setApplied(analysisId, applied), created }
  }

  private context(): ScreenContext {
    return ScreenContextSchema.parse({
      screen: 'analysis',
      pillars: this.deps.pillars().map((p) => p.name)
    })
  }
}
