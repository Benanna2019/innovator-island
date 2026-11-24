import { describe, expect, it } from 'vitest'
import { RideController, type RideConfig, type RideSnapshot } from '#/domain/ride-controller'
import { Rngs } from '#/domain/rng'
import { RIDE_SEEDS } from '#/domain/rides-seed'

const ride: RideConfig = { minWait: 10, maxWait: 60, waitChangeRate: 5, closureProbability: 0.1 }
const open = (wait: number, targetWait: number): RideSnapshot => ({ wait, targetWait, closed: false })
const always = (n: number) => () => n

describe('RideController.step', () => {
  it('moves the wait toward the target by at most the change rate', () => {
    const up = RideController.step(ride, open(20, 50), always(0.9))
    expect(up).toMatchObject({ wait: 25, targetWait: 50, closed: false, transition: 'wait-changed' })
    const down = RideController.step(ride, open(40, 12), always(0.9))
    expect(down.wait).toBe(35)
  })

  it('does not overshoot the target and then picks a new one', () => {
    const next = RideController.step(ride, open(48, 50), always(0.9))
    expect(next.wait).toBe(50)
    expect(next.targetWait).toBeGreaterThanOrEqual(ride.minWait)
    expect(next.targetWait).toBeLessThanOrEqual(ride.maxWait)
  })

  it('reports no transition when the wait is already at the target', () => {
    const next = RideController.step(ride, open(30, 30), always(0.9))
    expect(next.wait).toBe(30)
    expect(next.transition).toBe('none')
  })

  it('closes when the roll is under the closure probability, with a zero wait', () => {
    const next = RideController.step(ride, open(30, 40), always(0.05))
    expect(next).toMatchObject({ closed: true, wait: 0, transition: 'closed' })
  })

  it('stays closed when the reopen roll fails', () => {
    const next = RideController.step(ride, { wait: 0, targetWait: 40, closed: true }, always(0.9))
    expect(next).toMatchObject({ closed: true, wait: 0, transition: 'none' })
  })

  it('reopens at the minimum wait when the reopen roll succeeds', () => {
    const next = RideController.step(ride, { wait: 0, targetWait: 40, closed: true }, always(0.1))
    expect(next).toMatchObject({ closed: false, wait: ride.minWait, transition: 'reopened' })
  })

  it('is deterministic for a seeded rng', () => {
    const run = (seed: number) => {
      const rng = Rngs.seeded(seed)
      let state: RideSnapshot = RideController.initial(ride, rng)
      const trace: number[] = []
      for (let i = 0; i < 50; i++) {
        state = RideController.step(ride, state, rng)
        trace.push(state.wait)
      }
      return trace
    }
    expect(run(7)).toEqual(run(7))
    expect(run(7)).not.toEqual(run(8))
  })

  it('keeps every seeded ride inside its min and max over a long run', () => {
    for (const seed of RIDE_SEEDS) {
      const rng = Rngs.seeded(seed.slug.length)
      let state: RideSnapshot = RideController.initial(seed, rng)
      for (let i = 0; i < 500; i++) {
        state = RideController.step(seed, state, rng)
        if (state.closed) expect(state.wait).toBe(0)
        else {
          expect(state.wait).toBeGreaterThanOrEqual(seed.minWait)
          expect(state.wait).toBeLessThanOrEqual(seed.maxWait)
        }
      }
    }
  })
})

describe('RIDE_SEEDS', () => {
  it('has 16 rides with unique slugs and sane ranges', () => {
    expect(RIDE_SEEDS).toHaveLength(16)
    expect(new Set(RIDE_SEEDS.map((r) => r.slug)).size).toBe(16)
    for (const r of RIDE_SEEDS) {
      expect(r.minWait).toBeLessThan(r.maxWait)
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.x).toBeLessThanOrEqual(100)
    }
  })
})
