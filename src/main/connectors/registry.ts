import type { Connector } from '@shared/connectors/Connector'
import type { Network } from '@shared/connectors/networks'
import { AppError } from '@shared/domain/errors'
import { InstagramConnector } from './instagram/instagram.connector'

/** Conectores disponibles. Las redes de la Fase 7 se añaden aquí. */
export class ConnectorRegistry {
  private readonly connectors = new Map<Network, Connector>()

  constructor(connectors: Connector[] = [new InstagramConnector()]) {
    for (const c of connectors) this.connectors.set(c.network, c)
  }

  has(network: Network): boolean {
    return this.connectors.has(network)
  }

  get(network: Network): Connector {
    const connector = this.connectors.get(network)
    if (!connector) {
      throw new AppError('NOT_CONFIGURED', `La red "${network}" no tiene conector registrado.`)
    }
    return connector
  }

  list(): Connector[] {
    return [...this.connectors.values()]
  }
}
