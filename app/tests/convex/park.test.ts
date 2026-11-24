// @vitest-environment edge-runtime
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import aggregateTest from '@convex-dev/aggregate/test'
import { api, internal } from '../../convex/_generated/api'
import { EVENT_RETENTION_MS } from '../../convex/events'
import { DISPATCHED_TYPES, EventBus } from '../../convex/lib/eventBus'
import schema from '../../convex/schema'
import '../../convex/subscribers'

const modules = import.meta.glob('../../convex/**/*.ts')

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function seeded() {
  const t = convexTest(schema, modules)
  aggregateTest.register(t, 'parkStats')
  await t.mutation(internal.seed.run, {})
  return t
}

describe('park.tick', () => {
  it('seeds 16 rides once', async () => {
    const t = await seeded()
    expect(await t.mutation(internal.seed.run, {})).toMatchObject({ created: 0 })
    const list = await t.query(api.rides.list, { parkSlug: 'innovator-island' })
    expect(list?.rides).toHaveLength(16)
  })

  it('writes ride states and events, and opens one outage per closed ride', async () => {
    const t = await seeded()
    vi.spyOn(Math, 'random').mockReturnValue(0) // every open ride rolls a closure
    await t.mutation(internal.park.tick, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const list = await t.query(api.rides.list, { parkSlug: 'innovator-island' })
    expect(list?.rides.every((r) => r.closed && r.wait === 0)).toBe(true)

    const outages = await t.query(api.outages.active, { parkSlug: 'innovator-island' })
    expect(outages).toHaveLength(16)

    const events = await t.run((ctx) => ctx.db.query('parkEvents').collect())
    expect(events.filter((e) => e.payload.type === 'RideClosed')).toHaveLength(16)
    expect(events.filter((e) => e.payload.type === 'OutageRaised')).toHaveLength(16)
    expect(events.every((e) => e.handledBy !== undefined || e.payload.type === 'OutageRaised')).toBe(true)
  })

  it('resolves the outage when the ride reopens', async () => {
    const t = await seeded()
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    await t.mutation(internal.park.tick, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    random.mockReturnValue(0.1) // closed rides roll under the reopen probability
    await t.mutation(internal.park.tick, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await t.query(api.outages.active, { parkSlug: 'innovator-island' })).toHaveLength(0)
  })

  it('does not run a subscriber twice for the same event', async () => {
    const t = await seeded()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    await t.mutation(internal.park.tick, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const closed = await t.run((ctx) => ctx.db.query('parkEvents').collect())
    const event = closed.find((e) => e.payload.type === 'RideClosed')
    expect(event).toBeDefined()
    if (!event) return
    await t.mutation(internal.events.dispatch, { eventId: event._id })
    expect(await t.query(api.outages.active, { parkSlug: 'innovator-island' })).toHaveLength(16)
  })
})

const scheduledNames = (t: Awaited<ReturnType<typeof seeded>>) =>
  t.run(async (ctx) => (await ctx.db.system.query('_scheduled_functions').collect()).map((f) => f.name))

const firstRide = (t: Awaited<ReturnType<typeof seeded>>) =>
  t.run(async (ctx) => {
    const ride = await ctx.db.query('rides').first()
    if (!ride) throw new Error('not seeded')
    return { parkId: ride.parkId, rideId: ride._id }
  })

describe('dispatch scheduling', () => {
  it('lists exactly the event types that have a subscriber', () => {
    const types = ['RideWaitChanged', 'RideClosed', 'RideReopened', 'OutageRaised', 'VisitorEntered', 'VisitorRode', 'VisitorExited'] as const
    const subscribed = types.filter((type) => EventBus.subscribersFor(type).length > 0)
    expect([...DISPATCHED_TYPES].sort()).toEqual([...subscribed].sort())
  })

  it('schedules no dispatch for an event nobody handles, and one for an event that has a subscriber', async () => {
    const t = await seeded()
    const { parkId, rideId } = await firstRide(t)
    await t.run((ctx) => EventBus.publish(ctx, parkId, { type: 'RideWaitChanged', rideId, wait: 5, previousWait: 4 }))
    expect(await scheduledNames(t)).toEqual([])
    await t.run((ctx) => EventBus.publish(ctx, parkId, { type: 'RideClosed', rideId }))
    expect(await scheduledNames(t)).toEqual(['events:dispatch'])
  })
})

describe('ride states', () => {
  it('does not patch a ride whose step changed nothing', async () => {
    const t = await seeded()
    // A closed ride that stays closed: step returns wait 0 and no transition.
    await t.run(async (ctx) => {
      for (const s of await ctx.db.query('rideStates').collect()) await ctx.db.patch(s._id, { closed: true, wait: 0, updatedAt: 1 })
    })
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    await t.mutation(internal.park.tick, {})
    const states = await t.run((ctx) => ctx.db.query('rideStates').collect())
    expect(states.every((s) => s.updatedAt === 1)).toBe(true)
  })
})

describe('events.prune', () => {
  it('deletes old events, keeps recent ones, and removes visitor events from the stats aggregate', async () => {
    const t = await seeded()
    const { parkId, rideId } = await firstRide(t)
    const visitorId = await t.run((ctx) => ctx.db.insert('visitors', { parkId, guestId: 'sim-1', enteredAt: Date.now() }))
    const publish = (payload: Parameters<typeof EventBus.publish>[2]) => t.run((ctx) => EventBus.publish(ctx, parkId, payload, { dispatch: false }))

    await publish({ type: 'VisitorEntered', visitorId })
    await publish({ type: 'RideWaitChanged', rideId, wait: 5, previousWait: 4 })
    vi.setSystemTime(Date.now() + EVENT_RETENTION_MS + 1000)
    await publish({ type: 'VisitorEntered', visitorId })

    expect((await t.query(api.stats.summary, { parkSlug: 'innovator-island' }))?.totalVisitors).toBe(2)
    expect(await t.mutation(internal.events.prune, {})).toBe(2)
    expect(await t.run((ctx) => ctx.db.query('parkEvents').collect())).toHaveLength(1)
    expect((await t.query(api.stats.summary, { parkSlug: 'innovator-island' }))?.totalVisitors).toBe(1)
  })
})
