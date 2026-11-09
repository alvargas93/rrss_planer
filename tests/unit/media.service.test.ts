import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MediaService } from '@main/services/media.service'
import type { MediaCreate, MediaRepository } from '@main/repositories/media.repository'
import type { MediaAsset } from '@shared/domain/media'
import { mediaUrl } from '@shared/domain/media'
import { AppError } from '@shared/domain/errors'

/** PNG válido de 1×1 píxel (67 bytes). */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

class FakeMediaRepository implements Pick<MediaRepository, 'list' | 'findBySha' | 'create'> {
  assets: MediaAsset[] = []

  list(): MediaAsset[] {
    return this.assets
  }

  findBySha(sha256: string): MediaAsset | null {
    return this.assets.find((a) => a.sha256 === sha256) ?? null
  }

  create(input: MediaCreate): MediaAsset {
    const asset: MediaAsset = {
      ...input,
      id: input.id ?? `m${this.assets.length + 1}`,
      altText: '',
      derivedFrom: null,
      url: mediaUrl(input.fileName),
      thumbUrl: null,
      probe: {},
      createdAt: 'now',
      updatedAt: 'now'
    }
    this.assets.push(asset)
    return asset
  }
}

let sourceDir: string
let mediaDir: string

beforeEach(() => {
  sourceDir = mkdtempSync(join(tmpdir(), 'rrss-src-'))
  mediaDir = mkdtempSync(join(tmpdir(), 'rrss-media-'))
})

afterEach(() => {
  rmSync(sourceDir, { recursive: true, force: true })
  rmSync(mediaDir, { recursive: true, force: true })
})

function service(repo: FakeMediaRepository, picks: string[]): MediaService {
  return new MediaService(repo as unknown as MediaRepository, mediaDir, async () => picks)
}

describe('MediaService.import', () => {
  it('copia la imagen a la carpeta de medios y lee sus dimensiones', async () => {
    const source = join(sourceDir, 'foto.png')
    writeFileSync(source, PNG_1X1)
    const repo = new FakeMediaRepository()

    const [asset] = await service(repo, [source]).import()

    expect(asset?.kind).toBe('image')
    expect(asset?.mime).toBe('image/png')
    expect(asset?.width).toBe(1)
    expect(asset?.height).toBe(1)
    expect(asset?.originalName).toBe('foto.png')
    expect(asset?.sizeBytes).toBe(PNG_1X1.length)
    expect(asset?.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(existsSync(join(mediaDir, asset!.fileName))).toBe(true)
    expect(asset?.url).toBe(mediaUrl(asset!.fileName))
  })

  it('no duplica un archivo ya importado (misma huella)', async () => {
    const a = join(sourceDir, 'a.png')
    const b = join(sourceDir, 'copia.png')
    writeFileSync(a, PNG_1X1)
    writeFileSync(b, PNG_1X1)
    const repo = new FakeMediaRepository()

    const assets = await service(repo, [a, b]).import()

    expect(assets).toHaveLength(2)
    expect(assets[0]?.id).toBe(assets[1]?.id)
    expect(repo.assets).toHaveLength(1)
    expect(readdirSync(mediaDir)).toHaveLength(1)
  })

  it('rechaza formatos no admitidos con un error claro', async () => {
    const source = join(sourceDir, 'documento.pdf')
    writeFileSync(source, 'no soy una imagen')
    const repo = new FakeMediaRepository()

    await expect(service(repo, [source]).import()).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining('.pdf')
    } satisfies Partial<AppError>)
    expect(readdirSync(mediaDir)).toHaveLength(0)
  })

  it('devuelve lista vacía si el usuario cancela el diálogo', async () => {
    const repo = new FakeMediaRepository()
    expect(await service(repo, []).import()).toEqual([])
  })
})
