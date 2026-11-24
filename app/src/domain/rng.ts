/** A random source returning a number in [0, 1). Injected so decisions stay pure and testable. */
export type Rng = () => number

export class Rngs {
  /** Deterministic generator (mulberry32). Same seed, same sequence: used by tests and, later, replayable sims. */
  static seeded(seed: number): Rng {
    let a = seed >>> 0
    return () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  /** Integer in [min, max], inclusive. */
  static int(rng: Rng, min: number, max: number): number {
    return min + Math.floor(rng() * (max - min + 1))
  }
}
