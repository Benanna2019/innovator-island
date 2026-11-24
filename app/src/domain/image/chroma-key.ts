export type Hsv = readonly [h: number, s: number, v: number]
export interface HsvRange {
  lower: Hsv
  upper: Hsv
}

/** The upstream default for OpenCV's `inRange`: H 0-179, S and V 0-255. */
export const DEFAULT_GREEN_RANGE: HsvRange = { lower: [36, 50, 50], upper: [70, 255, 255] }

/** Pure-TypeScript replacement for OpenCV's `cvtColor(BGR2HSV)` plus `inRange`. No native code. */
export class ChromaKey {
  /** RGB (0-255) to HSV on OpenCV's scale: hue 0-179, saturation and value 0-255. */
  static rgbToHsv(r: number, g: number, b: number): Hsv {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min
    let hue = 0
    if (delta !== 0) {
      if (max === r) hue = ((g - b) / delta) % 6
      else if (max === g) hue = (b - r) / delta + 2
      else hue = (r - g) / delta + 4
      hue *= 60
      if (hue < 0) hue += 360
    }
    const saturation = max === 0 ? 0 : (delta / max) * 255
    return [Math.round(hue / 2), Math.round(saturation), max]
  }

  static inRange(hsv: Hsv, range: HsvRange): boolean {
    return hsv.every((c, i) => c >= range.lower[i] && c <= range.upper[i])
  }

  /** Makes every in-range pixel transparent, in place, and returns how many were keyed. `rgba` is width*height*4 bytes. */
  static apply(rgba: Uint8Array, range: HsvRange = DEFAULT_GREEN_RANGE): number {
    let keyed = 0
    for (let i = 0; i < rgba.length; i += 4) {
      const hsv = ChromaKey.rgbToHsv(rgba[i], rgba[i + 1], rgba[i + 2])
      if (ChromaKey.inRange(hsv, range)) {
        rgba[i + 3] = 0
        keyed++
      }
    }
    return keyed
  }
}
