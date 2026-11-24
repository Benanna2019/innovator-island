/** Largest decoded image we accept, in pixels. The 5 MB byte cap alone does not bound a decoded bitmap. */
export const MAX_PIXELS = 8_000_000

export interface ImageHeader {
  kind: 'png' | 'jpeg'
  width: number
  height: number
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * Reads the format and pixel size from the file header, without decoding. Returns null when the magic bytes are not
 * a PNG or JPEG, because the content type is whatever the client declared.
 */
export class ImageSniff {
  static header(bytes: Uint8Array): ImageHeader | null {
    if (PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return ImageSniff.png(bytes)
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return ImageSniff.jpeg(bytes)
    return null
  }

  static withinLimit(header: ImageHeader): boolean {
    return header.width > 0 && header.height > 0 && header.width * header.height <= MAX_PIXELS
  }

  private static u16(bytes: Uint8Array, at: number): number {
    return ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0)
  }

  private static u32(bytes: Uint8Array, at: number): number {
    return ImageSniff.u16(bytes, at) * 65536 + ImageSniff.u16(bytes, at + 2)
  }

  /** IHDR is always the first chunk: 8 byte signature, 4 byte length, "IHDR", then width and height. */
  private static png(bytes: Uint8Array): ImageHeader | null {
    const isIhdr = [0x49, 0x48, 0x44, 0x52].every((b, i) => bytes[12 + i] === b)
    if (!isIhdr || bytes.length < 24) return null
    return { kind: 'png', width: ImageSniff.u32(bytes, 16), height: ImageSniff.u32(bytes, 20) }
  }

  /** Walks the marker segments to the first start-of-frame (SOF0 to SOF15, except DHT, JPG and DAC). */
  private static jpeg(bytes: Uint8Array): ImageHeader | null {
    let at = 2
    while (at + 4 <= bytes.length) {
      if (bytes[at] !== 0xff) return null
      const marker = bytes[at + 1] ?? 0
      if (marker === 0xff) {
        at += 1
        continue
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        at += 2
        continue
      }
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isFrame) {
        if (at + 9 > bytes.length) return null
        return { kind: 'jpeg', height: ImageSniff.u16(bytes, at + 5), width: ImageSniff.u16(bytes, at + 7) }
      }
      at += 2 + ImageSniff.u16(bytes, at + 2)
    }
    return null
  }
}
