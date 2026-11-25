import { describe, expect, it } from 'vitest'
import { GUEST_COUNT, GUEST_LANGUAGES, GuestFactory, GuestSim } from '#/domain/guests'
import type { GuestWorld } from '#/domain/guests'
import { RideController } from '#/domain/ride-controller'
import { Rngs } from '#/domain/rng'
import { STUB_HEIGHT, STUB_WIDTH, TicketStub } from '#/domain/image/ticket-stub'

const world: GuestWorld = {
  openRides: [
    { id: 'r1', wait: 10 },
    { id: 'r2', wait: 40 },
  ],
  rideIds: ['r1', 'r2', 'r3'],
  diningIds: ['facility-007'],
}

describe('GuestFactory', () => {
  it('makes the same guest for the same index, and unique slugs', () => {
    expect(GuestFactory.profile(7)).toEqual(GuestFactory.profile(7))
    expect(new Set(Array.from({ length: GUEST_COUNT }, (_, i) => GuestFactory.profile(i).slug)).size).toBe(GUEST_COUNT)
  })

  it('covers every language, with names that match the language', () => {
    const profiles = Array.from({ length: GUEST_COUNT }, (_, i) => GuestFactory.profile(i))
    for (const language of GUEST_LANGUAGES) expect(profiles.some((p) => p.language === language)).toBe(true)
    for (const p of profiles.filter((p) => p.language === 'ja')) expect(p.name).toMatch(/[぀-ヿ一-鿿]/)
    for (const p of profiles.filter((p) => p.language !== 'ja')) expect(p.name).not.toMatch(/[぀-ヿ一-鿿]/)
    for (const p of profiles) expect(p.initials.length).toBeGreaterThan(0)
  })
})

describe('GuestSim', () => {
  it('walks to a queue, rides, then walks on and counts the ride', () => {
    const walking = { status: 'walking' as const, favoriteRideIds: [] }
    const queue = GuestSim.step(walking, world, () => 0)
    if (!queue) throw new Error('expected a move')
    expect(queue.state).toMatchObject({ status: 'queuing' })
    const ride = GuestSim.step({ ...queue.state, favoriteRideIds: [] }, world, () => 0.5)
    if (!ride) throw new Error('expected a move')
    expect(ride.state).toMatchObject({ status: 'riding', rideId: queue.state.rideId })
    const done = GuestSim.step({ ...ride.state, favoriteRideIds: [] }, world, () => 0.5)
    expect(done).toMatchObject({ effect: 'rode', state: { status: 'walking' } })
  })

  it('sends the line away when the ride closes', () => {
    const move = GuestSim.step({ status: 'queuing', rideId: 'r3', favoriteRideIds: [] }, world, () => 0.5)
    expect(move?.state.status).toBe('walking')
  })

  it('leaves and comes back', () => {
    const left = GuestSim.step({ status: 'walking', favoriteRideIds: [] }, world, () => 0.95)
    expect(left).toMatchObject({ effect: 'left', state: { status: 'left' } })
    expect(GuestSim.step({ status: 'left', favoriteRideIds: [] }, world, () => 0.9)).toBeNull()
    expect(GuestSim.step({ status: 'left', favoriteRideIds: [] }, world, () => 0.1)).toMatchObject({ effect: 'entered' })
  })

  it('prefers favorites and short waits, and returns null with nothing open', () => {
    const rng = Rngs.seeded(1)
    const picks = Array.from({ length: 400 }, () => GuestSim.chooseRide(world.openRides, ['r2'], rng))
    expect(picks.filter((p) => p === 'r2').length).toBeGreaterThan(100)
    expect(GuestSim.chooseRide([], [], rng)).toBeNull()
  })

  it('counts only guests in line', () => {
    const sizes = GuestSim.queueSizes([
      { status: 'queuing', rideId: 'r1' },
      { status: 'queuing', rideId: 'r1' },
      { status: 'riding', rideId: 'r1' },
      { status: 'walking' },
    ])
    expect(Object.fromEntries(sizes)).toEqual({ r1: 2 })
  })
})

describe('RideController with a queue', () => {
  const ride = { minWait: 10, maxWait: 100, waitChangeRate: 10, closureProbability: 0 }
  it('aims higher when guests are in line, and not at all without a queue', () => {
    const state = { wait: 30, targetWait: 30, closed: false }
    const quiet = RideController.step(ride, state, () => 0.5)
    const busy = RideController.step(ride, state, () => 0.5, 40)
    expect(quiet.wait).toBe(30)
    expect(busy.wait).toBeGreaterThan(quiet.wait)
    expect(busy.wait).toBeLessThanOrEqual(ride.maxWait)
  })
})

describe('TicketStub', () => {
  it('draws a full, deterministic, opaque image', () => {
    const a = TicketStub.draw(12345)
    expect(a.width).toBe(STUB_WIDTH)
    expect(a.height).toBe(STUB_HEIGHT)
    expect(a.data).toHaveLength(STUB_WIDTH * STUB_HEIGHT * 4)
    expect(a.data.filter((_, i) => i % 4 === 3).every((alpha) => alpha === 255)).toBe(true)
    expect(Buffer.from(TicketStub.draw(12345).data).equals(Buffer.from(a.data))).toBe(true)
    expect(Buffer.from(TicketStub.draw(99).data).equals(Buffer.from(a.data))).toBe(false)
  })
})
