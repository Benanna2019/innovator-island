// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../convex/_generated/api'
import { seeded, signedIn } from './helpers'
import type { Tester } from './helpers'

// `withIdentity` returns a narrower handle than the full tester: it can call functions and read or write the database.
type Caller = Pick<Tester, 'mutation' | 'query'>

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const firstRide = async (t: Tester) => {
  const list = await t.query(api.rides.list, { parkSlug: 'innovator-island' })
  const ride = list?.rides[0]
  if (!ride) throw new Error('expected a ride')
  return ride
}

describe('admin role checks', () => {
  it('turns away signed-out callers and guests from every admin function', async () => {
    const t = await seeded()
    const ride = await firstRide(t)
    const guest = await signedIn(t, 'guest', 'guest@example.test')
    const noRole = await signedIn(t, undefined, 'plain@example.test')

    const calls: [string, (c: Caller) => Promise<unknown>][] = [
      ['setSimulation', (c) => c.mutation(api.admin.setSimulation, { enabled: false })],
      ['triggerOutage', (c) => c.mutation(api.admin.triggerOutage, { rideId: ride.id })],
      ['reopenRide', (c) => c.mutation(api.admin.reopenRide, { rideId: ride.id })],
      ['updateRide', (c) => c.mutation(api.admin.updateRide, { rideId: ride.id, maxWait: 50, closureProbability: 0.1 })],
      ['resetDemo', (c) => c.mutation(api.admin.resetDemo, {})],
      ['overview', (c) => c.query(api.admin.overview, {})],
    ]
    for (const [name, call] of calls) {
      await expect(call(t), `${name} signed out`).rejects.toThrow(/Unauthenticated/)
      await expect(call(guest.as), `${name} as guest`).rejects.toThrow(/Forbidden/)
      await expect(call(noRole.as), `${name} as a user with no role`).rejects.toThrow(/Forbidden/)
    }
    // And nothing changed.
    const state = await t.run((ctx) => ctx.db.query('rideStates').collect())
    expect(state.every((s) => !s.closed)).toBe(true)
    expect((await t.run((ctx) => ctx.db.query('parks').collect()))[0].simulationEnabled).toBeUndefined()
  })

  it('lets an admin pause the simulation, trigger and clear an outage, and edit a ride', async () => {
    const t = await seeded()
    const admin = await signedIn(t, 'admin', 'admin@example.test')
    const ride = await firstRide(t)

    await admin.as.mutation(api.admin.setSimulation, { enabled: false })
    expect((await admin.as.query(api.admin.overview, {}))?.simulationEnabled).toBe(false)

    await admin.as.mutation(api.admin.triggerOutage, { rideId: ride.id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await t.query(api.outages.active, { parkSlug: 'innovator-island' })).toEqual([expect.objectContaining({ rideName: ride.name })])
    expect((await t.query(api.rides.list, { parkSlug: 'innovator-island' }))?.rides.find((r) => r.id === ride.id)).toMatchObject({ closed: true, wait: 0 })

    await admin.as.mutation(api.admin.reopenRide, { rideId: ride.id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await t.query(api.outages.active, { parkSlug: 'innovator-island' })).toEqual([])

    await admin.as.mutation(api.admin.updateRide, { rideId: ride.id, maxWait: 77, closureProbability: 0.2 })
    const overview = await admin.as.query(api.admin.overview, {})
    expect(overview?.rides.find((r) => r.id === ride.id)).toMatchObject({ maxWait: 77, closureProbability: 0.2 })
  })

  it('validates ride edits', async () => {
    const t = await seeded()
    const admin = await signedIn(t, 'admin')
    const ride = await firstRide(t)
    await expect(admin.as.mutation(api.admin.updateRide, { rideId: ride.id, maxWait: 1.5, closureProbability: 0.1 })).rejects.toThrow(/BadMaxWait/)
    await expect(admin.as.mutation(api.admin.updateRide, { rideId: ride.id, maxWait: 1000, closureProbability: 0.1 })).rejects.toThrow(/BadMaxWait/)
    await expect(admin.as.mutation(api.admin.updateRide, { rideId: ride.id, maxWait: 60, closureProbability: 2 })).rejects.toThrow(/BadProbability/)
  })

  it('only resets demo data on a demo deployment', async () => {
    const t = await seeded()
    const admin = await signedIn(t, 'admin')
    await expect(admin.as.mutation(api.admin.resetDemo, {})).rejects.toThrow(/NotDemo/)
  })
})

describe('admin throttles', () => {
  it('limits admin writes across all admins', async () => {
    const t = await seeded()
    const admin = await signedIn(t, 'admin')
    for (let i = 0; i < 30; i++) await admin.as.mutation(api.admin.setSimulation, { enabled: i % 2 === 0 })
    await expect(admin.as.mutation(api.admin.setSimulation, { enabled: true })).rejects.toThrow(/RateLimited/)
    const ride = await firstRide(t)
    await expect(admin.as.mutation(api.admin.triggerOutage, { rideId: ride.id })).rejects.toThrow(/RateLimited/)
  })

  it('allows one reset at a time and one every five minutes', async () => {
    vi.stubEnv('DEMO_MODE', 'true')
    const t = await seeded()
    const admin = await signedIn(t, 'admin')
    await admin.as.mutation(api.admin.resetDemo, {})
    // A second request while the first is marked as running is refused, and a stale mark expires.
    await expect(admin.as.mutation(api.admin.resetDemo, {})).rejects.toThrow(/ResetRunning/)
    vi.setSystemTime(Date.now() + 11 * 60 * 1000)
    await admin.as.mutation(api.admin.resetDemo, {})
    // Mark cleared (as `endReset` does) but still inside the five minute window.
    const [park] = await t.run((ctx) => ctx.db.query('parks').collect())
    await t.run((ctx) => ctx.db.patch(park._id, { resetStartedAt: undefined }))
    await expect(admin.as.mutation(api.admin.resetDemo, {})).rejects.toThrow(/RateLimited/)
  })
})

describe('viewer and public config', () => {
  it('reports the viewer role, and demo mode with sign-up closed', async () => {
    const t = await seeded()
    expect(await t.query(api.viewer.me, {})).toBeNull()
    const guest = await signedIn(t, undefined, 'plain@example.test')
    expect(await guest.as.query(api.viewer.me, {})).toMatchObject({ role: 'guest' })
    expect(await t.query(api.viewer.publicConfig, {})).toEqual({ demoMode: false, signUpOpen: true })
    vi.stubEnv('DEMO_MODE', 'true')
    expect(await t.query(api.viewer.publicConfig, {})).toEqual({ demoMode: true, signUpOpen: false })
  })
})
