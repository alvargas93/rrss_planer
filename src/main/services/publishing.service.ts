import { join } from 'node:path'
import type { PostDetail, PostStatus, PostSummary } from '@shared/domain/posts'
import type { PostTarget, TargetMode, ValidationIssue } from '@shared/domain/publishing'
import { MAX_ATTEMPTS, OVERDUE_GRACE_MS, retryDelayMs } from '@shared/domain/publishing'
import { NETWORK_META, type Network } from '@shared/connectors/networks'
import { AppError } from '@shared/domain/errors'
import type { PostsRepository } from '../repositories/posts.repository'
import type { TargetsRepository } from '../repositories/targets.repository'
import type { AccountsService } from './accounts.service'
import type { ConnectorRegistry } from '../connectors/registry'
import type { MediaHost } from '../media-host/media-host'
import type { Notifier } from '../notifications'
import type { SettingsService } from './settings.service'
import { createLogger } from '../log'

const log = createLogger('publishing')

/** Margen mínimo entre la subida y la hora de publicación que exige la red. */
const NATIVE_MIN_LEAD_MS = 15 * 60_000
/** Con cuánta antelación se sube a las redes con programación nativa. */
const NATIVE_WINDOW_MS = 24 * 60 * 60_000

export interface PublishingDeps {
  posts: PostsRepository
  targets: TargetsRepository
  accounts: AccountsService
  connectors: ConnectorRegistry
  mediaHost: () => MediaHost
  settings: SettingsService
  notify: Notifier
  mediaDir: string
  /** Avisa a la interfaz de que un post cambió (estado de destinos). */
  onPostChanged: (postId: string) => void
  /** Copia texto al portapapeles (modo manual). Inyectado para poder probar sin Electron. */
  copyToClipboard: (text: string) => void
  /** Devuelve una versión JPEG de una imagen (la propia si ya lo es). */
  prepareImage: (asset: PostDetail['media'][number]) => Promise<PostDetail['media'][number]>
}

/**
 * Cola de publicación. Convierte las variantes de un post en "destinos" (una red → una
 * cuenta), los ejecuta a su hora con reintentos y refleja el estado en el post.
 */
export class PublishingService {
  private running = new Set<string>()

  constructor(private readonly deps: PublishingDeps) {}

  // ------------------------------------------------------------ destinos

  /** Alinea los destinos con las variantes del post (se llama al guardar o programar). */
  syncTargets(postId: string): PostTarget[] {
    const detail = this.deps.posts.get(postId)
    const existing = this.deps.targets.listByPost(postId)
    const byNetwork = new Map(existing.map((t) => [t.network, t]))
    const accounts = this.deps.accounts.list()

    for (const variant of detail.variants) {
      const current = byNetwork.get(variant.network)
      if (current) {
        if (current.status === 'published' || current.status === 'publishing') continue
        this.deps.targets.update(current.id, {
          variantId: variant.id,
          scheduledAt: detail.post.scheduledAt,
          // Un destino cancelado o fallido vuelve a pendiente si se reprograma.
          ...(current.status === 'cancelled' || current.status === 'manual_notified'
            ? { status: 'pending', attempts: 0, lastError: null, nextAttemptAt: null }
            : {})
        })
        byNetwork.delete(variant.network)
        continue
      }
      // Cuenta por defecto: la única de esa red, si existe.
      const candidates = accounts.filter((a) => a.network === variant.network)
      const account = candidates.length === 1 ? candidates[0] : undefined
      const mode: TargetMode =
        account && this.deps.connectors.has(variant.network) ? 'api' : 'manual'
      this.deps.targets.create({
        postId,
        variantId: variant.id,
        accountId: account?.id ?? null,
        network: variant.network,
        mode,
        scheduledAt: detail.post.scheduledAt
      })
      byNetwork.delete(variant.network)
    }
    // Variantes eliminadas → destinos sin publicar fuera.
    for (const orphan of byNetwork.values()) {
      if (orphan.status !== 'published') this.deps.targets.delete(orphan.id)
    }
    this.recomputePostStatus(postId)
    return this.deps.targets.listByPost(postId)
  }

  setTarget(input: {
    postId: string
    network: Network
    accountId: string | null
    mode: TargetMode
  }): PostTarget[] {
    this.syncTargets(input.postId)
    const target = this.deps.targets
      .listByPost(input.postId)
      .find((t) => t.network === input.network)
    if (!target)
      throw new AppError(
        'NOT_FOUND',
        `El post no tiene versión para ${NETWORK_META[input.network].label}.`
      )
    if (target.status === 'published')
      throw new AppError('CONFLICT', 'Ese destino ya está publicado.')
    const mode: TargetMode =
      input.accountId && this.deps.connectors.has(input.network) ? input.mode : 'manual'
    this.deps.targets.update(target.id, {
      accountId: input.accountId,
      mode,
      status: 'pending',
      lastError: null,
      attempts: 0,
      nextAttemptAt: null
    })
    this.recomputePostStatus(input.postId)
    return this.deps.targets.listByPost(input.postId)
  }

  validate(postId: string): Record<string, ValidationIssue[]> {
    const detail = this.deps.posts.get(postId)
    const result: Record<string, ValidationIssue[]> = {}
    for (const variant of detail.variants) {
      if (!this.deps.connectors.has(variant.network)) {
        result[variant.network] = [
          {
            level: 'warning',
            message: 'Esta red todavía no tiene conector: se publicará en modo manual.'
          }
        ]
        continue
      }
      result[variant.network] = this.deps.connectors
        .get(variant.network)
        .validate(variant, detail.media)
    }
    return result
  }

  // ------------------------------------------------------------ ejecución

  /** Publica ya (sin esperar a la hora) un destino o todos los pendientes del post. */
  async publishNow(postId: string, targetId?: string): Promise<PostTarget[]> {
    const targets = this.syncTargets(postId).filter((t) => (targetId ? t.id === targetId : true))
    for (const target of targets) {
      if (target.status === 'published' || target.status === 'publishing') continue
      await this.process(target.id, { force: true, now: new Date() })
    }
    return this.deps.targets.listByPost(postId)
  }

  cancel(targetId: string): PostTarget {
    const target = this.deps.targets.get(targetId)
    if (target.status === 'published')
      throw new AppError('CONFLICT', 'Ya está publicada; no se puede cancelar.')
    const updated = this.deps.targets.update(targetId, { status: 'cancelled' })
    this.recomputePostStatus(target.postId)
    return updated
  }

  retry(targetId: string): PostTarget {
    const target = this.deps.targets.get(targetId)
    const updated = this.deps.targets.update(targetId, {
      status: 'pending',
      attempts: 0,
      lastError: null,
      nextAttemptAt: null
    })
    this.recomputePostStatus(target.postId)
    return updated
  }

  /**
   * Ejecuta lo que toque ahora. Lo llama el planificador cada minuto y al arrancar.
   * Los destinos con más de 24 h de retraso no se publican solos: se marcan para revisión.
   */
  async runDue(now = new Date()): Promise<void> {
    const due = this.deps.targets.listDue(now.toISOString())
    for (const target of due) {
      if (!target.scheduledAt) continue
      const lateMs = now.getTime() - new Date(target.scheduledAt).getTime()
      if (lateMs > OVERDUE_GRACE_MS && target.attempts === 0) {
        this.deps.targets.update(target.id, {
          status: 'failed',
          attempts: MAX_ATTEMPTS,
          lastError:
            'No se publicó a su hora porque la app estaba cerrada. Revísala y pulsa "Publicar ahora" si sigue teniendo sentido.'
        })
        this.recomputePostStatus(target.postId)
        this.notifyPost(
          target.postId,
          'Publicación atrasada',
          'La app estaba cerrada a la hora prevista. Revísala en el calendario.'
        )
        continue
      }
      await this.process(target.id, { force: false, now })
    }
    await this.uploadAhead(now)
  }

  /**
   * Redes con programación nativa (YouTube): si el destino sale en las próximas 24 h, se
   * sube ya y la propia red lo publica a su hora, aunque la app esté cerrada entonces.
   * Se exige un margen de 15 minutos porque la red rechaza horas demasiado cercanas.
   */
  private async uploadAhead(now: Date): Promise<void> {
    const from = new Date(now.getTime() + NATIVE_MIN_LEAD_MS).toISOString()
    const to = new Date(now.getTime() + NATIVE_WINDOW_MS).toISOString()
    for (const target of this.deps.targets.listUpcoming(from, to)) {
      if (target.mode !== 'api' || !target.accountId) continue
      if (!this.deps.connectors.has(target.network)) continue
      if (!this.deps.connectors.get(target.network).capabilities().nativeScheduling) continue
      await this.process(target.id, { force: false, now, publishAt: target.scheduledAt })
    }
  }

  private async process(
    targetId: string,
    options: { force: boolean; now: Date; publishAt?: string | null }
  ): Promise<void> {
    if (this.running.has(targetId)) return
    this.running.add(targetId)
    try {
      const target = this.deps.targets.get(targetId)
      const detail = this.deps.posts.get(target.postId)
      const variant = detail.variants.find((v) => v.id === target.variantId)
      if (!variant) {
        this.fail(target, 'La versión de esta red ya no existe.', true, options.now)
        return
      }
      const host = this.deps.mediaHost()
      const needsHosting =
        detail.media.length > 0 &&
        this.deps.connectors.has(target.network) &&
        this.deps.connectors.get(target.network).capabilities().requiresPublicMediaUrl
      const manual =
        target.mode === 'manual' ||
        !target.accountId ||
        !this.deps.connectors.has(target.network) ||
        (needsHosting && !host.isConfigured())

      if (manual) {
        this.notifyManual(
          detail,
          target,
          variant.text,
          needsHosting && !host.isConfigured() && !!target.accountId
        )
        return
      }

      await this.publishViaApi(
        target,
        detail,
        variant.id,
        options.force,
        options.now,
        options.publishAt ?? null
      )
    } finally {
      this.running.delete(targetId)
    }
  }

  private async publishViaApi(
    target: PostTarget,
    detail: PostDetail,
    variantId: string,
    force: boolean,
    now: Date,
    publishAt: string | null
  ): Promise<void> {
    const variant = detail.variants.find((v) => v.id === variantId)!
    const connector = this.deps.connectors.get(target.network)
    const account = this.deps.accounts.get(target.accountId!)
    const issues = connector.validate(variant, detail.media).filter((i) => i.level === 'error')
    if (issues.length > 0) {
      this.fail(target, issues.map((i) => i.message).join(' '), true, now)
      return
    }
    if (account.status === 'expired' || account.status === 'revoked') {
      this.fail(target, `La cuenta @${account.username} necesita volver a conectarse.`, true, now)
      return
    }

    this.deps.targets.update(target.id, { status: 'publishing', lastError: null })
    this.recomputePostStatus(target.postId)
    const hosted: Array<{ remove: () => Promise<void> }> = []
    try {
      const host = this.deps.mediaHost()
      const caps = connector.capabilities()
      const rule = caps.kinds[variant.kind]
      const media: Array<{
        asset: PostDetail['media'][number]
        publicUrl: string
        filePath: string
      }> = []
      for (const original of detail.media) {
        // Imágenes en un formato que la red no admite (PNG, WebP): se convierten a JPEG.
        const asset =
          original.kind === 'image' && rule && !rule.imageMimes.includes(original.mime)
            ? await this.deps.prepareImage(original)
            : original
        const filePath = join(this.deps.mediaDir, asset.fileName)
        if (caps.requiresPublicMediaUrl) {
          // Instagram exige una URL pública: alojamiento temporal.
          const uploaded = await host.upload(asset, filePath)
          hosted.push(uploaded)
          media.push({ asset, publicUrl: uploaded.publicUrl, filePath })
        } else {
          // YouTube, LinkedIn y X reciben los bytes directamente desde el equipo.
          media.push({ asset, publicUrl: '', filePath })
        }
      }
      const result = await connector.publish({
        account,
        accessToken: await this.deps.accounts.freshToken(account.id),
        variant,
        media,
        publishAt,
        onProgress: (message) => log.info(`[${account.username}] ${message}`)
      })
      this.deps.targets.update(target.id, {
        status: 'published',
        publishedAt: publishAt ?? new Date().toISOString(),
        externalPostId: result.externalPostId,
        externalUrl: result.externalUrl,
        lastError: null
      })
      this.recomputePostStatus(target.postId)
      if (this.deps.settings.get().publishing.notifyOnPublish) {
        this.notifyPost(
          target.postId,
          `Publicado en ${NETWORK_META[target.network].label}`,
          publishAt
            ? `«${detail.post.title}» está subida y ${NETWORK_META[target.network].label} la publicará el ${new Date(publishAt).toLocaleString('es')}.`
            : `«${detail.post.title}» ya está en @${account.username}.`
        )
      }
      if (result.notice) this.notifyPost(target.postId, 'Revisa esta publicación', result.notice)
      log.info(`Publicado ${detail.post.title} en ${target.network} (${result.externalPostId})`)
    } catch (error) {
      const appError = AppError.from(error)
      const final = appError.code === 'VALIDATION' || appError.code === 'UNAUTHORIZED' || force
      if (appError.code === 'UNAUTHORIZED')
        this.deps.accounts.markError(account.id, appError.message)
      this.fail(target, appError.message, final, now)
    } finally {
      for (const h of hosted) await h.remove()
    }
  }

  private fail(target: PostTarget, message: string, final: boolean, now: Date): void {
    const attempts = target.attempts + 1
    const exhausted = final || attempts >= MAX_ATTEMPTS
    this.deps.targets.update(target.id, {
      status: 'failed',
      attempts,
      lastError: message,
      nextAttemptAt: exhausted
        ? null
        : new Date(now.getTime() + retryDelayMs(attempts - 1)).toISOString()
    })
    this.recomputePostStatus(target.postId)
    log.warn(`Fallo en destino ${target.id} (${target.network}): ${message}`)
    if (exhausted) this.notifyPost(target.postId, 'No se pudo publicar', message)
  }

  /** Modo manual: copia el texto al portapapeles y avisa con los archivos listos. */
  private notifyManual(
    detail: PostDetail,
    target: PostTarget,
    text: string,
    missingHost: boolean
  ): void {
    this.deps.copyToClipboard(text)
    const files = detail.media.map((m) => m.originalName).join(', ')
    const why = missingHost
      ? 'No hay alojamiento de medios configurado, así que toca publicar a mano.'
      : 'Esta publicación está en modo manual.'
    this.deps.targets.update(target.id, { status: 'manual_notified', lastError: null })
    this.recomputePostStatus(target.postId)
    this.notifyPost(
      target.postId,
      `Hora de publicar en ${NETWORK_META[target.network].label}`,
      `${why} El texto está copiado al portapapeles${files ? ` y los archivos son: ${files}` : ''}.`
    )
  }

  private notifyPost(postId: string, title: string, body: string): void {
    this.deps.notify({ title, body, navigateTo: `/compose/${postId}` })
    this.deps.onPostChanged(postId)
  }

  /** Estado del post a partir de sus destinos. */
  recomputePostStatus(postId: string): void {
    const detail = this.deps.posts.get(postId)
    const targets = this.deps.targets.listByPost(postId)
    let status: PostStatus
    const statuses = targets.map((t) => t.status)
    if (targets.length === 0) status = detail.post.scheduledAt ? 'scheduled' : 'draft'
    else if (statuses.every((s) => s === 'published' || s === 'manual_notified'))
      status = statuses.includes('published') ? 'published' : 'scheduled'
    else if (statuses.includes('publishing')) status = 'publishing'
    else if (statuses.includes('published')) status = 'partial'
    else if (statuses.some((s) => s === 'failed')) status = 'failed'
    else if (statuses.every((s) => s === 'cancelled')) status = 'cancelled'
    else status = detail.post.scheduledAt ? 'scheduled' : 'draft'
    if (status !== detail.post.status) this.deps.posts.setStatus(postId, status)
    this.deps.onPostChanged(postId)
  }

  /** Resúmenes de post con sus destinos (para calendario y listas). */
  withTargets(summaries: PostSummary[]): Array<PostSummary & { targets: PostTarget[] }> {
    const targets = this.deps.targets.listByPosts(summaries.map((s) => s.id))
    return summaries.map((s) => ({ ...s, targets: targets.filter((t) => t.postId === s.id) }))
  }
}
