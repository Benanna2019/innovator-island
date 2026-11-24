import { Data, Effect } from 'effect'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
/** Jimp decodes these without native code. Upstream accepted whatever OpenCV could read. */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png'] as const

export class UploadTooLarge extends Data.TaggedError('UploadTooLarge')<{ size: number; max: number }> {}
export class NotAnImage extends Data.TaggedError('NotAnImage')<{ contentType: string }> {}
export class ChromaKeyFailed extends Data.TaggedError('ChromaKeyFailed')<{ reason: string }> {}

export type UploadError = UploadTooLarge | NotAnImage
export type PhotoErrorTag = UploadError['_tag'] | ChromaKeyFailed['_tag']

/** Runs on the client before upload and again on the server, because the client check is only a courtesy. */
export class PhotoValidation {
  static validate(file: { size: number; type: string }): Effect.Effect<void, UploadError> {
    return Effect.gen(function* () {
      if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
        return yield* Effect.fail(new NotAnImage({ contentType: file.type }))
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return yield* Effect.fail(new UploadTooLarge({ size: file.size, max: MAX_UPLOAD_BYTES }))
      }
    })
  }

  /** The first problem with a file, or null when it is fine. */
  static firstError(file: { size: number; type: string }): UploadError | null {
    return Effect.runSync(
      Effect.match(PhotoValidation.validate(file), {
        onFailure: (e): UploadError | null => e,
        onSuccess: (): UploadError | null => null,
      }),
    )
  }
}
