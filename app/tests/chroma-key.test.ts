import { readFileSync } from 'node:fs'
import { Effect } from 'effect'
import { Jimp } from 'jimp'
import { describe, expect, it } from 'vitest'
import { ChromaKey, DEFAULT_GREEN_RANGE } from '#/domain/image/chroma-key'
import { PHOTO_HEIGHT, PHOTO_WIDTH } from '#/domain/image/assets.generated'
import { ImagePipeline } from '#/domain/image/pipeline'

const fixture = () => new Uint8Array(readFileSync(new URL('./fixtures/greenscreen.png', import.meta.url)))
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(Effect.flip(effect)))
const fail = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect))

describe('ChromaKey', () => {
  it('converts to the OpenCV HSV scale', () => {
    expect(ChromaKey.rgbToHsv(255, 0, 0)).toEqual([0, 255, 255])
    expect(ChromaKey.rgbToHsv(0, 255, 0)).toEqual([60, 255, 255])
    expect(ChromaKey.rgbToHsv(0, 0, 255)).toEqual([120, 255, 255])
    expect(ChromaKey.rgbToHsv(128, 128, 128)).toEqual([0, 0, 128])
  })

  it('uses the upstream default range', () => {
    expect(DEFAULT_GREEN_RANGE).toEqual({ lower: [36, 50, 50], upper: [70, 255, 255] })
    expect(ChromaKey.inRange(ChromaKey.rgbToHsv(20, 200, 40), DEFAULT_GREEN_RANGE)).toBe(true)
    expect(ChromaKey.inRange(ChromaKey.rgbToHsv(200, 40, 140), DEFAULT_GREEN_RANGE)).toBe(false)
    // Dark green is too dim (value under 50) and pale green too washed out (saturation under 50).
    expect(ChromaKey.inRange(ChromaKey.rgbToHsv(0, 40, 0), DEFAULT_GREEN_RANGE)).toBe(false)
    expect(ChromaKey.inRange(ChromaKey.rgbToHsv(230, 255, 230), DEFAULT_GREEN_RANGE)).toBe(false)
  })

  it('makes only green pixels transparent', () => {
    const rgba = new Uint8Array([20, 200, 40, 255, 200, 40, 140, 255])
    expect(ChromaKey.apply(rgba)).toBe(1)
    expect([rgba[3], rgba[7]]).toEqual([0, 255])
  })
})

describe('ImagePipeline', () => {
  it('keys the green-screen fixture and keeps the subject', async () => {
    const png = await run(ImagePipeline.chromaKey(fixture()))
    const image = await Jimp.read(Buffer.from(png))
    expect([image.bitmap.width, image.bitmap.height]).toEqual([PHOTO_WIDTH, PHOTO_HEIGHT])
    const alphaAt = (x: number, y: number) => image.bitmap.data[(y * image.bitmap.width + x) * 4 + 3]
    expect(alphaAt(5, 5)).toBe(0)
    expect(alphaAt(PHOTO_WIDTH / 2, PHOTO_HEIGHT - 20)).toBe(255)
  })

  it('composites onto our background and frame, then finalizes to a JPEG', async () => {
    const keyed = await run(ImagePipeline.chromaKey(fixture()))
    const composed = await run(ImagePipeline.composite(keyed))
    const composedImage = await Jimp.read(Buffer.from(composed))
    // The old top-left green corner is now our sky or frame, so it is opaque and not green.
    const [r, , b] = [composedImage.bitmap.data[4 * 700], composedImage.bitmap.data[4 * 700 + 1], composedImage.bitmap.data[4 * 700 + 2]]
    expect(composedImage.bitmap.data[4 * 700 + 3]).toBe(255)
    expect(r + b).toBeGreaterThan(0)
    const jpeg = await run(ImagePipeline.finalize(composed))
    expect(Array.from(jpeg.slice(0, 2))).toEqual([0xff, 0xd8])
  })

  it('fails with ChromaKeyFailed when there is no green screen', async () => {
    const plain = new Jimp({ width: 32, height: 32, color: 0xc83c8cff })
    const error = await fail(ImagePipeline.chromaKey(new Uint8Array(await plain.getBuffer('image/png'))))
    expect(error._tag).toBe('ChromaKeyFailed')
  })

  it('fails with NotAnImage when the bytes are not an image', async () => {
    const error = await fail(ImagePipeline.chromaKey(new Uint8Array([1, 2, 3, 4])))
    expect(error._tag).toBe('NotAnImage')
  })
})
