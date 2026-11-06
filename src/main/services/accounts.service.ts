import type { Account } from '@shared/domain/accounts'
import { statusFromExpiry, TOKEN_EXPIRING_DAYS } from '@shared/domain/accounts'
import type { Capabilities } from '@shared/connectors/Connector'
import type { Network } from '@shared/connectors/networks'
import { AppError } from '@shared/domain/errors'
import type { AccountsRepository } from '../repositories/accounts.repository'
import type { SecretStore } from '../secrets/secrets.service'
import type { ConnectorRegistry } from '../connectors/registry'
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
    private readonly runOAuth: OAuthRunner
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

  async refresh(id: string): Promise<Account> {
    const account = this.repo.get(id)
    const connector = this.connectors.get(account.network)
    try {
      const refreshed = await connector.refreshToken(this.tokenFor(id))
      this.secrets.set(this.repo.secretKeyOf(id), refreshed.accessToken)
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
    } catch (error) {
      const appError = AppError.from(error)
      log.warn(`No se pudo refrescar ${account.username}: ${appError.message}`)
      return this.repo.update(id, { lastError: appError.message, status: 'error' })
    }
  }

  /** Refresca los tokens que caducan en menos de N días. Lo llama el planificador a diario. */
  async refreshExpiring(now = new Date()): Promise<void> {
    for (const account of this.repo.list()) {
      if (!account.tokenExpiresAt) continue
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
  }

  /** Marca el error de la cuenta (p. ej. token caducado detectado al publicar). */
  markError(id: string, message: string | null): void {
    this.repo.update(id, { lastError: message, status: message ? 'error' : 'connected' })
  }

  // ------------------------------------------------------------ privados

  private store(
    network: Network,
    token: string,
    expiresAt: string,
    scopes: string[],
    meta: Record<string, unknown>,
    identity: {
      externalId: string
      username: string
      displayName: string
      avatarUrl: string | null
      accountType: string
    }
  ): Account {
    const secretKey = `account.${network}.${identity.externalId}`
    this.secrets.set(secretKey, token)
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
