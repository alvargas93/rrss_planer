import { describe, expect, it } from 'vitest'
import {
  KIND_META,
  NETWORK_META,
  NETWORKS,
  aspectToRatio,
  extractHashtags
} from '@shared/connectors/networks'
import { PostCreateSchema, PostScheduleSchema } from '@shared/domain/posts'
import { mediaUrl } from '@shared/domain/media'

describe('redes y formatos', () => {
  it('cada red tiene un formato por defecto que está en su lista', () => {
    for (const network of NETWORKS) {
      const meta = NETWORK_META[network]
      expect(meta.kinds).toContain(meta.defaultKind)
      for (const kind of meta.kinds) expect(KIND_META[kind]).toBeDefined()
    }
  })

  it('extrae hashtags únicos, con acentos y en minúsculas', () => {
    expect(extractHashtags('Hola #Reel #reel #vídeo_corto y #2026')).toEqual([
      '#reel',
      '#vídeo_corto',
      '#2026'
    ])
    expect(extractHashtags('sin etiquetas')).toEqual([])
  })

  it('convierte relaciones de aspecto en números', () => {
    expect(aspectToRatio('1:1')).toBe(1)
    expect(aspectToRatio('9:16')).toBeCloseTo(0.5625)
    expect(aspectToRatio('16:9')).toBeCloseTo(1.777, 2)
  })
})

describe('esquemas de publicación', () => {
  it('rellena valores por defecto al crear', () => {
    const parsed = PostCreateSchema.parse({ title: 'Prueba' })
    expect(parsed.body).toBe('')
    expect(parsed.variants).toEqual([])
    expect(parsed.mediaIds).toEqual([])
    expect(parsed.scheduledAt).toBeNull()
  })

  it('rechaza títulos vacíos y redes desconocidas', () => {
    expect(PostCreateSchema.safeParse({ title: '   ' }).success).toBe(false)
    expect(
      PostCreateSchema.safeParse({ title: 'x', variants: [{ network: 'myspace', kind: 'feed' }] })
        .success
    ).toBe(false)
  })

  it('exige fechas ISO al programar y acepta null para desprogramar', () => {
    expect(
      PostScheduleSchema.safeParse({ id: 'a', scheduledAt: '2026-11-10T10:00:00.000Z' }).success
    ).toBe(true)
    expect(PostScheduleSchema.safeParse({ id: 'a', scheduledAt: null }).success).toBe(true)
    expect(PostScheduleSchema.safeParse({ id: 'a', scheduledAt: 'mañana' }).success).toBe(false)
  })
})

describe('medios', () => {
  it('construye URLs del protocolo interno escapando el nombre', () => {
    expect(mediaUrl('abc.jpg')).toBe('media://local/abc.jpg')
    expect(mediaUrl('con espacio.png')).toBe('media://local/con%20espacio.png')
  })
})
