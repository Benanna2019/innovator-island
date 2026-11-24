import { ChromaKeyFailed } from '../photo-validation'

/** A photo with less green than this has no usable green screen. */
export const MIN_KEYED_RATIO = 0.02

/** Keeps a ChromaKeyFailed that a step threw on purpose, and wraps anything else. */
export function ChromaFailedFromUnknown(cause: unknown): ChromaKeyFailed {
  if (cause instanceof ChromaKeyFailed) return cause
  return new ChromaKeyFailed({ reason: cause instanceof Error ? cause.message : 'Image processing failed' })
}
