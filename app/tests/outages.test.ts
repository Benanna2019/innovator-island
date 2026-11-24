import { describe, expect, it } from 'vitest'
import { Outages } from '#/domain/outages'
import { Rngs } from '#/domain/rng'

describe('Outages', () => {
  it('picks a known reason', () => {
    expect(Outages.REASONS).toContain(Outages.pickReason(Rngs.seeded(1)))
    expect(Outages.REASONS).toContain(Outages.pickReason(() => 0.999999))
  })
})
