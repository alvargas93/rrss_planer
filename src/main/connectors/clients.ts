import type { OAuthNetwork } from '@shared/domain/accounts'

/** Ajuste donde se guarda el ID de cliente (público) de la app de cada red. */
export const CLIENT_ID_SETTING = {
  youtube: 'youtubeClientId',
  linkedin: 'linkedinClientId',
  x: 'xClientId'
} as const satisfies Record<OAuthNetwork, string>

/** Clave del secreto de la app en la tabla `secrets` (cifrado con safeStorage). */
export const clientSecretKey = (network: OAuthNetwork): string => `${network}.clientSecret`
