// @vitest-environment edge-runtime
import aggregateTest from '@convex-dev/aggregate/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'

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

describe('simulator and stats', () => {
  it('counts headcount, rides and ratings from visitor events', async () => {
    const t = await seeded()
    for (let i = 0; i < 5; i++) await t.mutation(internal.simulate.visitorsTick, {})
    const stats = await t.query(api.stats.summary, { parkSlug: 'innovator-island' })
    if (!stats) throw new Error('expected stats')
    expect(stats.totalVisitors).toBeGreaterThan(0)
    expect(stats.headcount).toBeGreaterThan(0)
    expect(stats.headcount).toBeLessThanOrEqual(300)
    const visitors = await t.run((ctx) => ctx.db.query('visitors').collect())
    expect(stats.totalVisitors).toBe(visitors.length)
    expect(stats.headcount).toBe(visitors.filter((v) => v.exitedAt === undefined).length)
    const rodeCount = await t.run(async (ctx) =>
      (await ctx.db.query('parkEvents').collect()).filter((e) => e.payload.type === 'VisitorRode').length,
    )
    expect(stats.totalRides).toBe(rodeCount)
    if (rodeCount > 0) {
      expect(stats.averageRating).toBeGreaterThanOrEqual(1)
      expect(stats.averageRating).toBeLessThanOrEqual(5)
    }
    expect(stats.ridesPerHour).toHaveLength(12)
  })

  it('does nothing while the park is paused', async () => {
    const t = await seeded()
    await t.mutation(internal.park.setSimulation, { enabled: false })
    expect(await t.mutation(internal.simulate.visitorsTick, {})).toBe(0)
    expect(await t.mutation(internal.park.tick, {})).toBe(0)
    const stats = await t.query(api.stats.summary, { parkSlug: 'innovator-island' })
    expect(stats).toMatchObject({ totalVisitors: 0, headcount: 0, park: { paused: true } })
    await t.mutation(internal.park.setSimulation, { enabled: true })
    await t.mutation(internal.simulate.visitorsTick, {})
    expect(await t.query(api.stats.summary, { parkSlug: 'innovator-island' })).toMatchObject({ park: { paused: false } })
  })
})
