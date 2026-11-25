import { readFileSync } from 'node:fs'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { ImagePipeline } from '#/domain/image/pipeline'
import { ImageSniff, MAX_PIXELS } from '#/domain/image/sniff'

const fixture = () => new Uint8Array(readFileSync(new URL('./fixtures/greenscreen.png', import.meta.url)))
const fail = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect))

/** The first 24 bytes of a PNG that declares a size. There is no pixel data, so decoding it would fail anyway. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

/** SOI, an APP0 segment to walk past, then SOF0. */
function jpegHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(2 + 4 + 14 + 19)
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
  const sof = 2 + 2 + 16
  bytes.set([0xff, 0xc0, 0x00, 0x11, 0x08], sof)
  const view = new DataView(bytes.buffer)
  view.setUint16(sof + 5, height)
  view.setUint16(sof + 7, width)
  return bytes
}

describe('ImageSniff', () => {
  it('reads PNG and JPEG sizes from the header', () => {
    expect(ImageSniff.header(pngHeader(640, 480))).toEqual({ kind: 'png', width: 640, height: 480 })
    expect(ImageSniff.header(jpegHeader(1024, 768))).toEqual({ kind: 'jpeg', width: 1024, height: 768 })
    expect(ImageSniff.header(fixture())).toMatchObject({ kind: 'png' })
  })

  it('returns null for anything else, whatever the client said it was', () => {
    expect(ImageSniff.header(new TextEncoder().encode('GIF89a not a png'))).toBeNull()
    expect(ImageSniff.header(new Uint8Array(0))).toBeNull()
    expect(ImageSniff.header(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull()
  })

  it('caps pixels at about 8 MP', () => {
    expect(ImageSniff.withinLimit({ kind: 'png', width: 3264, height: 2448 })).toBe(true)
    expect(MAX_PIXELS).toBe(8_000_000)
    expect(ImageSniff.withinLimit({ kind: 'png', width: 4000, height: 2001 })).toBe(false)
    expect(ImageSniff.withinLimit({ kind: 'png', width: 0, height: 10 })).toBe(false)
  })
})

describe('ImagePipeline.chromaKey input checks', () => {
  it('rejects a huge declared size as NotAnImage before decoding', async () => {
    expect(await fail(ImagePipeline.chromaKey(pngHeader(40_000, 40_000)))).toMatchObject({ _tag: 'NotAnImage' })
    expect(await fail(ImagePipeline.chromaKey(jpegHeader(30_000, 30_000)))).toMatchObject({ _tag: 'NotAnImage' })
  })

  it('rejects bytes that are not PNG or JPEG', async () => {
    expect(await fail(ImagePipeline.chromaKey(new TextEncoder().encode('<svg></svg>')))).toMatchObject({ _tag: 'NotAnImage' })
  })
})
