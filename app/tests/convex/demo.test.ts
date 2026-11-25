// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import { MAX_GUEST_UPDATES } from '../../convex/simulate'
import { GUEST_COUNT } from '../../src/domain/guests'
import { seeded } from './helpers'
import type { Tester } from './helpers'

const HOUR = 60 * 60 * 1000

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function seedGuests(t: Tester) {
  let created = 0
  for (let from = 0; from < GUEST_COUNT; from += 100) created += await t.mutation(internal.seed.demoGuests, { from, count: 100 })
  return created
}

describe('demo accounts and seeding refuse outside demo mode', () => {
  it('refuses seed:demo, the seed batches and ensureAccounts when DEMO_MODE is off', async () => {
    const t = await seeded()
    await expect(t.action(internal.seed.demo, {})).rejects.toThrow(/DEMO_MODE/)
    await expect(t.mutation(internal.seed.demoGuests, { from: 0, count: 10 })).rejects.toThrow(/DEMO_MODE/)
    await expect(t.mutation(internal.seed.demoHistory, { fromHourAgo: 0, hours: 3 })).rejects.toThrow(/DEMO_MODE/)
    await expect(t.action(internal.demo.ensureAccounts, {})).rejects.toThrow(/DEMO_MODE/)
    expect(await t.run((ctx) => ctx.db.query('guests').collect())).toHaveLength(0)
  })

  it('refuses ensureAccounts without both password env vars', async () => {
    const t = await seeded()
    vi.stubEnv('DEMO_MODE', 'true')
    await expect(t.action(internal.demo.ensureAccounts, {})).rejects.toThrow(/DEMO_ADMIN_PASSWORD and DEMO_GUEST_PASSWORD/)
    vi.stubEnv('DEMO_ADMIN_PASSWORD', 'a-long-enough-password')
    await expect(t.action(internal.demo.ensureAccounts, {})).rejects.toThrow(/DEMO_ADMIN_PASSWORD and DEMO_GUEST_PASSWORD/)
    vi.stubEnv('DEMO_GUEST_PASSWORD', 'short')
    await expect(t.action(internal.demo.ensureAccounts, {})).rejects.toThrow(/at least 8/)
    expect(await t.run((ctx) => ctx.db.query('users').collect())).toHaveLength(0)
  })
})

describe('demo seed', () => {
  it('creates 300 guests once, with matching stats events, and finds them again on a re-run', async () => {
    vi.stubEnv('DEMO_MODE', 'true')
    const t = await seeded()
    expect(await seedGuests(t)).toBe(GUEST_COUNT)
    expect(await seedGuests(t)).toBe(0)
    const guests = await t.run((ctx) => ctx.db.query('guests').collect())
    expect(guests).toHaveLength(GUEST_COUNT)
    expect(new Set(guests.map((g) => g.slug)).size).toBe(GUEST_COUNT)
    expect(new Set(guests.map((g) => g.language))).toEqual(new Set(['en', 'fr', 'es', 'ja']))

    // The aggregate and the visitors table agree: headcount is whoever has no exit.
    const stats = await t.query(api.stats.summary, { parkSlug: 'innovator-island' })
    const visitors = await t.run((ctx) => ctx.db.query('visitors').collect())
    expect(stats?.totalVisitors).toBe(visitors.length)
    expect(stats?.headcount).toBe(visitors.filter((v) => v.exitedAt === undefined).length)
    expect(stats?.languages.en).toBeGreaterThan(0)
  })

  it('seeds history and outages once and keeps the aggregate consistent', async () => {
    vi.stubEnv('DEMO_MODE', 'true')
    const t = await seeded()
    const run = async () => {
      let n = 0
      for (let h = 0; h < 66; h += 3) n += await t.mutation(internal.seed.demoHistory, { fromHourAgo: h, hours: 3 })
      return n
    }
    const first = await run()
    expect(first).toBeGreaterThan(50)
    // Same hours again: every visitor key already exists.
    expect(await run()).toBe(0)
    expect(await t.mutation(internal.seed.demoOutages, {})).toBeGreaterThan(0)
    await t.mutation(internal.seed.demoFinish, {})
    // Once finished, the whole history is guarded, even if time has moved on.
    vi.setSystemTime(Date.now() + 5 * 60 * 60 * 1000)
    expect(await run()).toBe(0)
    expect(await t.mutation(internal.seed.demoOutages, {})).toBe(0)

    const stats = await t.query(api.stats.summary, { parkSlug: 'innovator-island' })
    const visitors = await t.run((ctx) => ctx.db.query('visitors').collect())
    const rode = (await t.run((ctx) => ctx.db.query('parkEvents').collect())).filter((e) => e.payload.type === 'VisitorRode').length
    expect(stats?.totalVisitors).toBe(visitors.length)
    expect(stats?.totalRides).toBe(rode)
    expect(stats?.headcount).toBe(visitors.filter((v) => v.exitedAt === undefined).length)
    const outages = await t.run((ctx) => ctx.db.query('outages').collect())
    expect(outages.filter((o) => o.resolvedAt !== undefined).length).toBeGreaterThanOrEqual(5)
    expect(outages.filter((o) => o.resolvedAt === undefined)).toHaveLength(1)
  })

  it('wipes and reseeds on reset', async () => {
    vi.stubEnv('DEMO_MODE', 'true')
    const t = await seeded()
    await seedGuests(t)
    await t.mutation(internal.seed.demoFinish, {})
    let removed = 1
    while (removed > 0) removed = await t.mutation(internal.seed.clearBatch, {})
    expect(await t.run((ctx) => ctx.db.query('guests').collect())).toHaveLength(0)
    expect(await t.run((ctx) => ctx.db.query('parkEvents').collect())).toHaveLength(0)
    await t.mutation(internal.seed.resetRides, {})
    const [park] = await t.run((ctx) => ctx.db.query('parks').collect())
    expect(park.demoSeededAt).toBeUndefined()
    expect((await t.query(api.stats.summary, { parkSlug: 'innovator-island' }))?.totalVisitors).toBe(0)
  })
})

describe('reset, retention and top-up', () => {
  it('pauses the simulation during a reset and restores it, even when the reset fails', async () => {
    vi.stubEnv('DEMO_MODE', 'true')
    const t = await seeded()
    const park = async () => (await t.run((ctx) => ctx.db.query('parks').collect()))[0]
    const before = await t.mutation(internal.seed.beginReset, {})
    expect(before.simulationEnabled).toBeUndefined()
    expect((await park()).simulationEnabled).toBe(false)
    expect((await park()).resetStartedAt).toBeDefined()
    expect(await t.mutation(internal.simulate.visitorsTick, {})).toBe(0)
    await t.mutation(internal.seed.endReset, { simulationEnabled: before.simulationEnabled })
    expect((await park()).simulationEnabled).toBeUndefined()
    expect((await park()).resetStartedAt).toBeUndefined()

    // A park an admin had paused stays paused afterwards.
    const { _id } = await park()
    await t.run((ctx) => ctx.db.patch(_id, { simulationEnabled: false }))
    const paused = await t.mutation(internal.seed.beginReset, {})
    await t.mutation(internal.seed.endReset, { simulationEnabled: paused.simulationEnabled })
    expect((await park()).simulationEnabled).toBe(false)
  })

  it('clears only the demo park', async () => {
    vi.stubEnv('DEMO_MODE', 'true')
    const t = await seeded()
    await seedGuests(t)
    const otherPark = await t.run((ctx) => ctx.db.insert('parks', { slug: 'other', name: 'Other' }))
    await t.run(async (ctx) => {
      await ctx.db.insert('visitors', { parkId: otherPark, guestId: 'x', enteredAt: Date.now() })
      const ride = await ctx.db.query('rides').first()
      if (ride) await ctx.db.insert('outages', { parkId: otherPark, rideId: ride._id, reason: 'x', raisedAt: 1, lastAlertAt: 1 })
    })
    let removed = 1
    while (removed > 0) removed = await t.mutation(internal.seed.clearBatch, {})
    expect(await t.run((ctx) => ctx.db.query('visitors').collect())).toHaveLength(1)
    expect(await t.run((ctx) => ctx.db.query('outages').collect())).toHaveLength(1)
  })

  it('tops the history up when the last seed is over a day old, and only then', async () => {
    const t = await seeded()
    // Outside demo mode it does nothing.
    expect(await t.action(internal.seed.topUpHistory, {})).toBe(0)
    vi.stubEnv('DEMO_MODE', 'true')
    await t.mutation(internal.seed.demoFinish, {})
    expect(await t.action(internal.seed.topUpHistory, {})).toBe(0)

    vi.setSystemTime(Date.now() + 30 * HOUR)
    const visitorsBefore = (await t.run((ctx) => ctx.db.query('visitors').collect())).length
    const created = await t.action(internal.seed.topUpHistory, {})
    expect(created).toBeGreaterThan(0)
    const [park] = await t.run((ctx) => ctx.db.query('parks').collect())
    expect(Date.now() - (park.demoSeededAt ?? 0)).toBeLessThan(HOUR)
    // Stats and the visitors table still agree.
    const stats = await t.query(api.stats.summary, { parkSlug: 'innovator-island' })
    const visitors = await t.run((ctx) => ctx.db.query('visitors').collect())
    expect(visitors.length).toBe(visitorsBefore + created)
    expect(stats?.totalVisitors).toBe(visitors.length)
    // Fresh again, so a second run in the same day adds nothing.
    expect(await t.action(internal.seed.topUpHistory, {})).toBe(0)
  })

  it('prunes exited visitor rows with their arrival events, and keeps the ones still in the park', async () => {
    vi.stubEnv('DEMO_MODE', 'true')
    const t = await seeded()
    for (let h = 0; h < 66; h += 3) await t.mutation(internal.seed.demoHistory, { fromHourAgo: h, hours: 3 })
    const before = await t.run((ctx) => ctx.db.query('visitors').collect())
    expect(before.length).toBeGreaterThan(50)
    vi.setSystemTime(Date.now() + 30 * HOUR)
    let deleted = 1
    while (deleted > 0) deleted = await t.mutation(internal.events.prune, {})
    const after = await t.run((ctx) => ctx.db.query('visitors').collect())
    expect(after.length).toBeLessThan(before.length)
    expect(after.every((v) => v.exitedAt === undefined || v.enteredAt >= Date.now() - 3 * 24 * HOUR)).toBe(true)
    const stats = await t.query(api.stats.summary, { parkSlug: 'innovator-island' })
    expect(stats?.totalVisitors).toBe(after.length)
  })
})

describe('guest simulator', () => {
  it('writes at most MAX_GUEST_UPDATES guests per run, however many want to move', async () => {
    vi.stubEnv('DEMO_MODE', 'true')
    const t = await seeded()
    await seedGuests(t)
    const before = new Map((await t.run((ctx) => ctx.db.query('guests').collect())).map((g) => [g._id, g.stateSince]))
    vi.setSystemTime(Date.now() + 3 * 60 * 1000)
    // Always rolling 0 makes every guest who can move choose to, so the cap is what holds the count down.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    await t.mutation(internal.simulate.visitorsTick, {})
    const after = await t.run((ctx) => ctx.db.query('guests').collect())
    const moved = after.filter((g) => g.stateSince !== before.get(g._id)).length
    expect(moved).toBe(MAX_GUEST_UPDATES)
  })

  it('moves guests between runs and keeps queue sizes on the rides in step', async () => {
    vi.stubEnv('DEMO_MODE', 'true')
    const t = await seeded()
    await seedGuests(t)
    for (let i = 0; i < 6; i++) {
      vi.setSystemTime(Date.now() + 3 * 60 * 1000)
      await t.mutation(internal.simulate.visitorsTick, {})
    }
    const guests = await t.run((ctx) => ctx.db.query('guests').collect())
    const states = await t.run((ctx) => ctx.db.query('rideStates').collect())
    for (const s of states) expect(s.queue ?? 0).toBe(guests.filter((g) => g.status === 'queuing' && g.rideId === s.rideId).length)
    // Guests that finished rides are counted, and the stats events line up with the visitors table.
    expect(guests.some((g) => g.totalRides > 0)).toBe(true)
    const stats = await t.query(api.stats.summary, { parkSlug: 'innovator-island' })
    const visitors = await t.run((ctx) => ctx.db.query('visitors').collect())
    expect(stats?.headcount).toBe(visitors.filter((v) => v.exitedAt === undefined).length)
  })

  it('does nothing while the park is paused', async () => {
    vi.stubEnv('DEMO_MODE', 'true')
    const t = await seeded()
    await seedGuests(t)
    const [park] = await t.run((ctx) => ctx.db.query('parks').collect())
    await t.run((ctx) => ctx.db.patch(park._id, { simulationEnabled: false }))
    const before = await t.run((ctx) => ctx.db.query('guests').collect())
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(await t.mutation(internal.simulate.visitorsTick, {})).toBe(0)
    expect(await t.run((ctx) => ctx.db.query('guests').collect())).toEqual(before)
  })

  it('shows the queue and recent riders to the public', async () => {
    vi.stubEnv('DEMO_MODE', 'true')
    const t = await seeded()
    await seedGuests(t)
    const map = await t.query(api.guests.onMap, { parkSlug: 'innovator-island' })
    expect(map?.inPark).toBeGreaterThan(100)
    const queued = Object.entries(map?.queues ?? {})[0]
    expect(queued).toBeDefined()
    const rides = await t.query(api.rides.list, { parkSlug: 'innovator-island' })
    const ride = rides?.rides.find((r) => r.id === queued[0])
    const detail = await t.query(api.guests.forRide, { parkSlug: 'innovator-island', rideSlug: ride?.slug ?? '' })
    expect(detail?.queue.length).toBe(queued[1].count)
  })
})
