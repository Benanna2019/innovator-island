import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, PhotoValidation } from '#/domain/photo-validation'

describe('PhotoValidation', () => {
  it('accepts a JPEG and a PNG at the limit', () => {
    expect(PhotoValidation.firstError({ type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(PhotoValidation.firstError({ type: 'image/png', size: MAX_UPLOAD_BYTES })).toBeNull()
  })

  it('rejects non-images with NotAnImage', () => {
    expect(PhotoValidation.firstError({ type: 'application/pdf', size: 10 })?._tag).toBe('NotAnImage')
    expect(PhotoValidation.firstError({ type: '', size: 10 })?._tag).toBe('NotAnImage')
  })

  it('rejects big files with UploadTooLarge', () => {
    const error = PhotoValidation.firstError({ type: 'image/png', size: MAX_UPLOAD_BYTES + 1 })
    expect(error?._tag).toBe('UploadTooLarge')
  })

  it('reports the type problem before the size problem', () => {
    expect(PhotoValidation.firstError({ type: 'text/plain', size: MAX_UPLOAD_BYTES + 1 })?._tag).toBe('NotAnImage')
  })
})
