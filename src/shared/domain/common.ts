import { z } from 'zod'

/** Identificador de entidad (UUID v7 en texto). */
export const IdSchema = z.string().min(1)

/** Fecha y hora en ISO 8601 (UTC). */
export const IsoDateSchema = z.iso.datetime({ offset: true })

/** Color hexadecimal #rrggbb. */
export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal #rrggbb')

export const EntityBase = {
  id: IdSchema,
  createdAt: z.string(),
  updatedAt: z.string()
}

/** Paleta propia para pilares y etiquetas (no colores de marcas). */
export const PILLAR_PALETTE = [
  '#6b3ff2',
  '#ff6b5b',
  '#1f9d61',
  '#2b6fe6',
  '#c77d00',
  '#c026d3',
  '#14b8a6',
  '#e11d48'
] as const
