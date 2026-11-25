import { Rngs } from '../rng.ts'

export const STUB_WIDTH = 640
export const STUB_HEIGHT = 480

export interface Bitmap {
  width: number
  height: number
  /** RGBA, row by row. */
  data: Uint8Array
}

type Rgb = readonly [number, number, number]

const PALETTES: readonly { paper: Rgb; ink: Rgb; accent: Rgb }[] = [
  { paper: [251, 243, 220], ink: [8, 74, 90], accent: [242, 140, 40] },
  { paper: [255, 236, 200], ink: [31, 122, 61], accent: [194, 65, 12] },
  { paper: [236, 246, 247], ink: [11, 101, 119], accent: [255, 211, 77] },
  { paper: [253, 232, 228], ink: [122, 20, 11], accent: [11, 101, 119] },
]

// 3 by 5 digit glyphs, one row per number, for the serial.
const DIGITS = [
  [7, 5, 5, 5, 7],
  [2, 6, 2, 2, 7],
  [7, 1, 7, 4, 7],
  [7, 1, 7, 1, 7],
  [5, 5, 7, 1, 1],
  [7, 4, 7, 1, 7],
  [7, 4, 7, 5, 7],
  [7, 1, 1, 1, 1],
  [7, 5, 7, 5, 7],
  [7, 5, 7, 1, 7],
] as const

/**
 * A placeholder ride photo: a paper ticket stub with notched sides, a perforation, a star and a barcode on a sand
 * backdrop. Pure pixels, no fonts or files, so it runs in a Convex Node action. `seed` picks the palette and barcode.
 */
export class TicketStub {
  static draw(seed: number): Bitmap {
    const rng = Rngs.seeded(seed)
    const palette = PALETTES[seed % PALETTES.length]
    const data = new Uint8Array(STUB_WIDTH * STUB_HEIGHT * 4)
    const put = (x: number, y: number, [r, g, b]: Rgb) => {
      if (x < 0 || y < 0 || x >= STUB_WIDTH || y >= STUB_HEIGHT) return
      const i = (y * STUB_WIDTH + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
    const rect = (x: number, y: number, w: number, h: number, color: Rgb) => {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, color)
    }

    rect(0, 0, STUB_WIDTH, STUB_HEIGHT, [241, 226, 184])
    const left = 60
    const top = 80
    const width = STUB_WIDTH - 120
    const height = STUB_HEIGHT - 160
    for (let y = top; y < top + height; y++) {
      for (let x = left; x < left + width; x++) {
        // Half-circle notches in the left and right edges.
        const notch = (cx: number) => (x - cx) ** 2 + (y - (top + height / 2)) ** 2 < 28 ** 2
        if (!notch(left) && !notch(left + width)) put(x, y, palette.paper)
      }
    }
    rect(left, top, width, 10, palette.accent)
    rect(left, top + height - 10, width, 10, palette.accent)
    // Perforation between the stub and the main ticket.
    const cut = left + Math.floor(width * 0.72)
    for (let y = top + 14; y < top + height - 14; y += 14) rect(cut, y, 4, 8, palette.ink)

    // A star on the main ticket.
    const cx = left + Math.floor(width * 0.34)
    const cy = top + Math.floor(height * 0.4)
    for (let y = cy - 60; y <= cy + 60; y++) {
      for (let x = cx - 60; x <= cx + 60; x++) {
        const angle = Math.atan2(y - cy, x - cx)
        const radius = 34 + 26 * Math.cos(5 * angle)
        if (Math.hypot(x - cx, y - cy) < radius) put(x, y, palette.accent)
      }
    }
    for (let y = cy - 20; y <= cy + 20; y++) for (let x = cx - 20; x <= cx + 20; x++) if (Math.hypot(x - cx, y - cy) < 16) put(x, y, palette.ink)

    // Barcode along the bottom of the main ticket.
    let bx = left + 30
    while (bx < cut - 30) {
      const w = Rngs.int(rng, 2, 6)
      rect(bx, top + height - 90, w, 50, palette.ink)
      bx += w + Rngs.int(rng, 2, 5)
    }

    // A six digit serial on the stub.
    const serial = String(seed % 1_000_000).padStart(6, '0')
    const scale = 5
    for (let i = 0; i < serial.length; i++) {
      const glyph = DIGITS[Number(serial[i])]
      for (let row = 0; row < 5; row++)
        for (let col = 0; col < 3; col++)
          if (glyph[row] & (4 >> col)) rect(cut + 24 + col * scale + (i % 3) * 4 * scale, top + 60 + Math.floor(i / 3) * 8 * scale + row * scale, scale, scale, palette.ink)
    }
    // Colored stripes on the stub.
    rect(cut + 22, top + 150, width - (cut - left) - 44, 14, palette.ink)
    rect(cut + 22, top + 172, width - (cut - left) - 44, 14, palette.accent)
    return { width: STUB_WIDTH, height: STUB_HEIGHT, data }
  }
}
