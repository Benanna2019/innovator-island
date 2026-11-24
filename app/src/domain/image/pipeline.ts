import { Effect } from 'effect'
import { Jimp } from 'jimp'
import { ChromaFailedFromUnknown, MIN_KEYED_RATIO } from './pipeline-errors'
import { ChromaKey, DEFAULT_GREEN_RANGE } from './chroma-key'
import type { HsvRange } from './chroma-key'
import { BACKGROUND_PNG_BASE64, FRAME_PNG_BASE64, PHOTO_HEIGHT, PHOTO_WIDTH } from './assets.generated'
import { ChromaKeyFailed, NotAnImage } from '../photo-validation'
import { ImageSniff } from './sniff'

const fromBase64 = (b64: string) => Buffer.from(b64, 'base64')

/**
 * The three image steps, as Effects with tagged errors. Pure JS (jimp), so they run in a Convex Node action.
 * Upstream ran OpenCV in a Lambda for step one and Jimp for step two, with S3 buckets between the steps.
 */
export class ImagePipeline {
  /** Step 1. Scale the selfie to the photo size and make the green screen transparent. Returns PNG bytes. */
  static chromaKey(input: Uint8Array, range: HsvRange = DEFAULT_GREEN_RANGE): Effect.Effect<Uint8Array, NotAnImage | ChromaKeyFailed> {
    return Effect.gen(function* () {
      // Check magic bytes and the header's pixel size before decoding: Jimp decodes the whole bitmap.
      const header = ImageSniff.header(input)
      if (!header) return yield* Effect.fail(new NotAnImage({ contentType: 'unrecognized' }))
      if (!ImageSniff.withinLimit(header)) return yield* Effect.fail(new NotAnImage({ contentType: 'too many pixels' }))
      const image = yield* Effect.tryPromise({
        try: () => Jimp.read(Buffer.from(input)),
        catch: () => new NotAnImage({ contentType: 'undecodable' }),
      })
      return yield* Effect.tryPromise({
        try: async () => {
          image.cover({ w: PHOTO_WIDTH, h: PHOTO_HEIGHT })
          const keyed = ChromaKey.apply(image.bitmap.data, range)
          const ratio = keyed / (image.bitmap.width * image.bitmap.height)
          if (ratio < MIN_KEYED_RATIO) {
            throw new ChromaKeyFailed({ reason: 'No green screen found. Stand in front of a plain green background and try again.' })
          }
          return new Uint8Array(await image.getBuffer('image/png'))
        },
        catch: ChromaFailedFromUnknown,
      })
    })
  }

  /** Step 2. Our background, then the keyed photo, then our frame. Returns PNG bytes. */
  static composite(keyedPng: Uint8Array): Effect.Effect<Uint8Array, ChromaKeyFailed> {
    return Effect.tryPromise({
      try: async () => {
        const [background, subject, frame] = await Promise.all([
          Jimp.read(fromBase64(BACKGROUND_PNG_BASE64)),
          Jimp.read(Buffer.from(keyedPng)),
          Jimp.read(fromBase64(FRAME_PNG_BASE64)),
        ])
        background.composite(subject, 0, 0)
        background.composite(frame, 0, 0)
        return new Uint8Array(await background.getBuffer('image/png'))
      },
      catch: ChromaFailedFromUnknown,
    })
  }

  /** Step 3. Post-process to a small JPEG for the gallery. Upstream's last Lambda wrote the DynamoDB row. */
  static finalize(compositePng: Uint8Array): Effect.Effect<Uint8Array, ChromaKeyFailed> {
    return Effect.tryPromise({
      try: async () => {
        const image = await Jimp.read(Buffer.from(compositePng))
        return new Uint8Array(await image.getBuffer('image/jpeg', { quality: 85 }))
      },
      catch: ChromaFailedFromUnknown,
    })
  }
}
