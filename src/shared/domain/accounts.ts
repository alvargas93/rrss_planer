import { z } from 'zod'
import { EntityBase, IdSchema } from './common'
import { NETWORKS } from '../connectors/networks'

export const ACCOUNT_STATUSES = ['connected', 'expiring', 'expired', 'revoked', 'error'] as const
export const AccountStatusSchema = z.enum(ACCOUNT_STATUSES)
export type AccountStatus = z.infer<typeof AccountStatusSchema>

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  connected: 'Conectada',
  expiring: 'Caduca pronto',
  expired: 'Caducada',
  revoked: 'Acceso revocado',
  error: 'Con errores'
}

export const AccountSchema = z.object({
  ...EntityBase,
  network: z.enum(NETWORKS),
  externalId: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  accountType: z.string(),
  status: AccountStatusSchema,
  scopes: z.array(z.string()),
  tokenExpiresAt: z.string().nullable(),
  tokenRefreshedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  meta: z.record(z.string(), z.unknown())
})
export type Account = z.infer<typeof AccountSchema>

/** Conectar Instagram pegando un token generado en el App Dashboard de Meta. */
export const InstagramTokenConnectSchema = z.object({
  accessToken: z.string().trim().min(20, 'El token parece incompleto')
})

/** Iniciar el flujo OAuth (Business Login). Devuelve la cuenta cuando termina. */
export const InstagramOAuthConnectSchema = z.object({
  appId: z.string().trim().min(1),
  appSecret: z.string().trim().min(1)
})

/** Redes que se conectan con el flujo OAuth de escritorio y una app propia del usuario. */
export const OAUTH_NETWORKS = ['youtube', 'linkedin', 'x'] as const
export type OAuthNetwork = (typeof OAUTH_NETWORKS)[number]

/** Conectar YouTube, LinkedIn o X: ID público de la app y, si la red lo da, su secreto. */
export const OAuthConnectSchema = z.object({
  network: z.enum(OAUTH_NETWORKS),
  clientId: z.string().trim().min(1, 'Falta el ID de cliente'),
  clientSecret: z.string().trim().default('')
})

/** LinkedIn: token generado en el portal de desarrolladores (vía fiable, 60 días). */
export const LinkedInTokenConnectSchema = z.object({
  accessToken: z.string().trim().min(20, 'El token parece incompleto')
})

export const AccountByIdSchema = z.object({ id: IdSchema })

/** Umbral para marcar un token como "caduca pronto" y refrescarlo. */
export const TOKEN_EXPIRING_DAYS = 10

/** Decide el estado de una cuenta a partir de la caducidad del token. Pura (probada). */
export function statusFromExpiry(
  tokenExpiresAt: string | null,
  now: Date,
  lastError: string | null
): AccountStatus {
  if (lastError) return 'error'
  if (!tokenExpiresAt) return 'connected'
  const expires = new Date(tokenExpiresAt).getTime()
  if (Number.isNaN(expires)) return 'connected'
  if (expires <= now.getTime()) return 'expired'
  const daysLeft = (expires - now.getTime()) / 86_400_000
  return daysLeft <= TOKEN_EXPIRING_DAYS ? 'expiring' : 'connected'
}
