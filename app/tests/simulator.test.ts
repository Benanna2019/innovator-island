import { describe, expect, it } from 'vitest'
import { Rngs } from '#/domain/rng'
import { MAX_VISITORS, Simulator } from '#/domain/simulator'

describe('Simulator', () => {
  it('never lets the park go over the cap', () => {
    const rng = Rngs.seeded(1)
    for (let i = 0; i < 200; i++) {
      const headcount = Math.floor(rng() * (MAX_VISITORS + 50))
      expect(headcount + Simulator.arrivals(headcount, rng)).toBeLessThanOrEqual(Math.max(headcount, MAX_VISITORS))
    }
    expect(Simulator.arrivals(MAX_VISITORS, () => 0.99)).toBe(0)
  })

  it('has no ride to choose when everything is closed', () => {
    expect(Simulator.chooseRide([], () => 0.5)).toBeNull()
  })

  it('prefers short waits', () => {
    const rides = [
      { id: 'short', wait: 0 },
      { id: 'long', wait: 90 },
    ]
    const rng = Rngs.seeded(7)
    const picks = Array.from({ length: 500 }, () => Simulator.chooseRide(rides, rng)?.id)
    expect(picks.filter((p) => p === 'short').length).toBeGreaterThan(picks.filter((p) => p === 'long').length * 3)
  })

  it('rates between 1 and 5, lower for long waits', () => {
    const rng = Rngs.seeded(3)
    const ratings = (wait: number) => Array.from({ length: 300 }, () => Simulator.rate(wait, rng))
    const short = ratings(0)
    const long = ratings(120)
    for (const r of [...short, ...long]) expect(r >= 1 && r <= 5 && Number.isInteger(r)).toBe(true)
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(avg(short)).toBeGreaterThan(avg(long))
  })
})
