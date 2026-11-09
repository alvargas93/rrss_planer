import type { Account } from '@shared/domain/accounts'
import { statusFromExpiry, TOKEN_EXPIRING_DAYS } from '@shared/domain/accounts'
import type { Capabilities } from '@shared/connectors/Connector'
import type { Network } from '@shared/connectors/networks'
import { AppError } from '@shared/domain/errors'
import type { AccountsRepository } from '../repositories/accounts.repository'
import type { SecretStore } from '../secrets/secrets.service'
import type { ConnectorRegistry } from '../connectors/registry'
import type { OAuthClient, OAuthResult } from '../connectors/oauth-pkce'
import { createLogger } from '../log'

const log = createLogger('accounts')
const DAY_MS = 86_400_000
const ASSUMED_TOKEN_DAYS = 60

export type OAuthRunner = (input: { appId: string; appSecret: string }) => Promise<{
  accessToken: string
  expiresAt: string
  userId: string
  permissions: string[]
}>

export class AccountsService {
  constructor(
    private readonly repo: AccountsRepository,
    private readonly secrets: SecretStore,
    private readonly connectors: ConnectorRegistry,
    private readonly runOAuth: OAuthRunner,
    /** Flujos OAuth de YouTube, LinkedIn y X (con la app propia del usuario). */
    private readonly runners: Partial<
      Record<Network, (client: OAuthClient) => Promise<OAuthResult>>
    > = {}
  ) {}

  list(now = new Date()): Account[] {
    return this.repo.list().map((account) => this.withLiveStatus(account, now))
  }

  get(id: string, now = new Date()): Account {
    return this.withLiveStatus(this.repo.get(id), now)
  }

  capabilities(network: Network): Capabilities {
    return this.connectors.get(network).capabilities()
  }

  /** Token en claro de una cuenta (solo lo usa el publicador, en el proceso principal). */
  tokenFor(accountId: string): string {
    const token = this.secrets.get(this.repo.secretKeyOf(accountId))
    if (!token)
      throw new AppError(
        'UNAUTHORIZED',
        'No hay token guardado para esta cuenta. Vuelve a conectarla.'
      )
    return token
  }

  /**
   * Conecta Instagram con un token de larga duración generado en el App Dashboard de Meta.
   * Intenta refrescarlo para conocer la caducidad exacta; si Meta no lo permite todavía
   * (tokens con menos de 24 h), se asume 60 días y se marca como estimado.
   */
  async connectInstagramWithToken(accessToken: string): Promise<Account> {
    const connector = this.connectors.get('instagram')
    const identity = await connector.identify(accessToken)
    let token = accessToken
    let expiresAt: string
    let expiryAssumed = false
    try {
      const refreshed = await connector.refreshToken(accessToken)
      token = refreshed.accessToken
      expiresAt =
        refreshed.expiresAt ?? new Date(Date.now() + ASSUMED_TOKEN_DAYS * DAY_MS).toISOString()
    } catch (error) {
      log.info(
        `No se pudo refrescar el token al conectar (normal si es reciente): ${AppError.from(error).message}`
      )
      expiresAt = new Date(Date.now() + ASSUMED_TOKEN_DAYS * DAY_MS).toISOString()
      expiryAssumed = true
    }
    return this.store(
      'instagram',
      token,
      expiresAt,
      identity.scopes,
      { ...identity.meta, expiryAssumed, source: 'dashboard_token' },
      identity
    )
  }

  /** Conecta Instagram con Business Login (OAuth) usando el servidor local. */
  async connectInstagramOAuth(input: { appId: string; appSecret: string }): Promise<Account> {
    const connector = this.connectors.get('instagram')
    const result = await this.runOAuth(input)
    const identity = await connector.identify(result.accessToken)
    return this.store(
      'instagram',
      result.accessToken,
      result.expiresAt,
      result.permissions,
      { ...identity.meta, source: 'oauth' },
      identity
    )
  }

  /**
   * Conecta YouTube, LinkedIn o X con OAuth y la app que el usuario creó en cada red.
   * YouTube y X entregan un refresh token: el acceso dura horas y se renueva solo antes
   * de cada uso. LinkedIn entrega un acceso de 60 días que no se puede renovar sin volver
   * a autorizar.
   */
  async connectOAuth(network: Network, client: OAuthClient): Promise<Account> {
    const runner = this.runners[network]
    if (!runner) throw new AppError('NOT_CONFIGURED', `${network} no se conecta con OAuth.`)
    const result = await runner(client)
    const connector = this.connectors.get(network)
    const identity = await connector.identify(result.accessToken)
    const renewable = result.refreshToken !== null
    const meta: Record<string, unknown> = { ...identity.meta, source: 'oauth' }
    if (renewable) meta['accessExpiresAt'] = result.expiresAt
    return this.store(
      network,
      result.accessToken,
      renewable ? null : result.expiresAt,
      result.scopes,
      meta,
      identity,
      result.refreshToken
    )
  }

  /** LinkedIn con un token generado en el portal de desarrolladores (60 días). */
  async connectLinkedInWithToken(accessToken: string): Promise<Account> {
    const identity = await this.connectors.get('linkedin').identify(accessToken)
    return this.store(
      'linkedin',
      accessToken,
      new Date(Date.now() + ASSUMED_TOKEN_DAYS * DAY_MS).toISOString(),
      [],
      { ...identity.meta, expiryAssumed: true, source: 'portal_token' },
      identity,
      null
    )
  }

  /**
   * Token válido para usar ahora. Si es de corta duración y está a punto de caducar
   * (YouTube y X), lo renueva con el refresh token guardado.
   */
  async freshToken(id: string, now = new Date()): Promise<string> {
    const account = this.repo.get(id)
    const accessExpiresAt = account.meta['accessExpiresAt']
    if (
      typeof accessExpiresAt === 'string' &&
      new Date(accessExpiresAt).getTime() - now.getTime() < 5 * 60_000
    ) {
      await this.renew(id)
    }
    return this.tokenFor(id)
  }

  async refresh(id: string): Promise<Account> {
    const account = this.repo.get(id)
    try {
      return await this.renew(id)
    } catch (error) {
      const appError = AppError.from(error)
      log.warn(`No se pudo refrescar ${account.username}: ${appError.message}`)
      return this.repo.update(id, { lastError: appError.message, status: 'error' })
    }
  }

  /** Renueva el acceso de una cuenta; lanza el error si la red lo rechaza. */
  private async renew(id: string): Promise<Account> {
    const account = this.repo.get(id)
    const connector = this.connectors.get(account.network)
    const secretKey = this.repo.secretKeyOf(id)
    const refreshKey = `${secretKey}.refresh`
    const refreshed = await connector.refreshToken(this.tokenFor(id), this.secrets.get(refreshKey))
    this.secrets.set(secretKey, refreshed.accessToken)
    if (refreshed.refreshToken) this.secrets.set(refreshKey, refreshed.refreshToken)
    const shortLived = typeof account.meta['accessExpiresAt'] === 'string'
    if (shortLived) {
      // Acceso de horas: solo cambia la caducidad interna, la cuenta sigue conectada.
      return this.repo.update(id, {
        tokenRefreshedAt: new Date().toISOString(),
        lastError: null,
        status: 'connected',
        meta: { ...account.meta, accessExpiresAt: refreshed.expiresAt }
      })
    }
    const identity = await connector.identify(refreshed.accessToken).catch(() => null)
    return this.repo.update(id, {
      tokenExpiresAt: refreshed.expiresAt,
      tokenRefreshedAt: new Date().toISOString(),
      lastError: null,
      status: 'connected',
      ...(identity
        ? {
            username: identity.username,
            displayName: identity.displayName,
            avatarUrl: identity.avatarUrl,
            meta: { ...account.meta, ...identity.meta, expiryAssumed: false }
          }
        : {})
    })
  }

  /** Refresca los tokens que caducan en menos de N días. Lo llama el planificador a diario. */
  async refreshExpiring(now = new Date()): Promise<void> {
    for (const account of this.repo.list()) {
      if (!account.tokenExpiresAt) continue
      // Si la red no permite renovar sin volver a autorizar (LinkedIn), solo se avisa en la interfaz.
      if (
        this.connectors.has(account.network) &&
        !this.connectors.get(account.network).capabilities().autoRefresh
      ) {
        continue
      }
      const daysLeft = (new Date(account.tokenExpiresAt).getTime() - now.getTime()) / DAY_MS
      const refreshedRecently =
        account.tokenRefreshedAt &&
        now.getTime() - new Date(account.tokenRefreshedAt).getTime() < DAY_MS
      if (daysLeft <= TOKEN_EXPIRING_DAYS && daysLeft > 0 && !refreshedRecently) {
        await this.refresh(account.id)
      }
    }
  }

  disconnect(id: string): void {
    const key = this.repo.secretKeyOf(id)
    this.repo.delete(id)
    this.secrets.delete(key)
    this.secrets.delete(`${key}.refresh`)
  }

  /** Marca el error de la cuenta (p. ej. token caducado detectado al publicar). */
  markError(id: string, message: string | null): void {
    this.repo.update(id, { lastError: message, status: message ? 'error' : 'connected' })
  }

  // ------------------------------------------------------------ privados

  private store(
    network: Network,
    token: string,
    expiresAt: string | null,
    scopes: string[],
    meta: Record<string, unknown>,
    identity: {
      externalId: string
      username: string
      displayName: string
      avatarUrl: string | null
      accountType: string
    },
    refreshToken: string | null = null
  ): Account {
    const secretKey = `account.${network}.${identity.externalId}`
    this.secrets.set(secretKey, token)
    if (refreshToken) this.secrets.set(`${secretKey}.refresh`, refreshToken)
    const account = this.repo.upsert({
      network,
      externalId: identity.externalId,
      username: identity.username,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      accountType: identity.accountType,
      scopes,
      tokenExpiresAt: expiresAt,
      secretKey,
      meta
    })
    log.info(`Cuenta conectada: ${network} @${account.username}`)
    return account
  }

  private withLiveStatus(account: Account, now: Date): Account {
    if (account.status === 'revoked') return account
    return { ...account, status: statusFromExpiry(account.tokenExpiresAt, now, account.lastError) }
  }
}
