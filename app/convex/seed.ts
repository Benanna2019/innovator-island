import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalAction, internalMutation, internalQuery } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { flags } from "./lib/config"
import { EventBus } from "./lib/eventBus"
import { isStatsEvent, parkStats } from "./lib/parkStats"
import { FACILITIES } from "../src/domain/facilities.ts"
import { GUEST_COUNT, GuestFactory, GuestSim } from "../src/domain/guests.ts"
import { Outages } from "../src/domain/outages.ts"
import { PARK_SEED, RIDE_SEEDS } from "../src/domain/rides-seed.ts"
import { RideController } from "../src/domain/ride-controller.ts"
import { Rngs } from "../src/domain/rng.ts"
import { Simulator } from "../src/domain/simulator.ts"

/** Idempotent. Run with `npx convex run seed:run`. Existing rides are updated to the current name, icon and position. */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const park = await ctx.db.query("parks").withIndex("by_slug", (q) => q.eq("slug", PARK_SEED.slug)).unique()
    const parkId = park?._id ?? (await ctx.db.insert("parks", { ...PARK_SEED }))
    let created = 0
    let updated = 0
    for (const { legacySlugs, ...seed } of RIDE_SEEDS) {
      let existing = null
      for (const slug of [seed.slug, ...legacySlugs]) {
        existing = await ctx.db
          .query("rides")
          .withIndex("by_park_slug", (q) => q.eq("parkId", parkId).eq("slug", slug))
          .unique()
        if (existing) break
      }
      if (existing) {
        await ctx.db.patch(existing._id, { slug: seed.slug, name: seed.name, icon: seed.icon, x: seed.x, y: seed.y })
        updated++
        continue
      }
      const rideId = await ctx.db.insert("rides", { parkId, ...seed })
      const initial = RideController.initial(seed, Math.random)
      await ctx.db.insert("rideStates", { parkId, rideId, ...initial, updatedAt: Date.now() })
      created++
    }
    return { parkId, created, updated }
  },
})

// ---------------------------------------------------------------------------------------------------------------
// Demo data. Everything below is behind DEMO_MODE and idempotent: guests are found by slug, history is guarded by
// `parks.demoSeededAt` and by an hour key on each visitor, and every batch stays well under Convex's per-mutation limits.
// ---------------------------------------------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000
const GUEST_BATCH = 40
const HISTORY_HOURS = 66
const HOURS_PER_BATCH = 3

const requireDemoMode = () => {
  if (!flags().demoMode) throw new Error("seed:demo only runs when DEMO_MODE is true.")
}

async function parkOf(ctx: MutationCtx) {
  const park = await ctx.db.query("parks").withIndex("by_slug", (q) => q.eq("slug", PARK_SEED.slug)).unique()
  if (!park) throw new Error("No park. Run seed:run first.")
  return park
}

/** Idempotent. Creates the named guests with the given indexes, skipping any that already exist. */
export const demoGuests = internalMutation({
  args: { from: v.number(), count: v.number() },
  handler: async (ctx, { from, count }) => {
    requireDemoMode()
    const park = await parkOf(ctx)
    const rides = await ctx.db.query("rides").withIndex("by_park", (q) => q.eq("parkId", park._id)).collect()
    const states = await ctx.db.query("rideStates").withIndex("by_park", (q) => q.eq("parkId", park._id)).collect()
    const world = {
      openRides: states.filter((s) => !s.closed).map((s) => ({ id: s.rideId as string, wait: s.wait })),
      rideIds: rides.map((r) => r._id as string),
      diningIds: FACILITIES.filter((f) => f.kind === "dining").map((f) => f.id),
    }
    const now = Date.now()
    let created = 0
    for (let index = from; index < Math.min(GUEST_COUNT, from + count); index++) {
      const profile = GuestFactory.profile(index)
      const exists = await ctx.db.query("guests").withIndex("by_slug", (q) => q.eq("parkId", park._id).eq("slug", profile.slug)).unique()
      if (exists) continue
      const rng = Rngs.seeded(0x51ed + index)
      const favorites = [...rides].sort(() => rng() - 0.5).slice(0, 3).map((r) => r._id)
      const state = GuestSim.initial(world, favorites as string[], rng)
      const stateSince = now - Rngs.int(rng, 0, 20) * 60 * 1000
      const joinedAt = now - profile.joinedDaysAgo * 24 * HOUR - Rngs.int(rng, 0, 10) * HOUR
      let visitorId: Id<"visitors"> | undefined
      if (state.status !== "left") {
        const enteredAt = now - Rngs.int(rng, 5, 400) * 60 * 1000
        visitorId = await ctx.db.insert("visitors", { parkId: park._id, guestId: profile.slug, enteredAt })
        await EventBus.publish(ctx, park._id, { type: "VisitorEntered", visitorId }, { dispatch: false, at: enteredAt })
      }
      const lastRide = rides[Rngs.int(rng, 0, rides.length - 1)]
      const totalRides = Rngs.int(rng, 0, 14)
      await ctx.db.insert("guests", {
        parkId: park._id,
        slug: profile.slug,
        name: profile.name,
        language: profile.language,
        avatarHue: profile.avatarHue,
        initials: profile.initials,
        status: state.status,
        rideId: state.rideId as Id<"rides"> | undefined,
        facilityId: state.facilityId,
        walkFrom: state.walkFrom,
        walkTo: state.walkTo,
        stateSince,
        favoriteRideIds: favorites,
        totalRides,
        ...(totalRides > 0 ? { lastRideId: lastRide._id, lastRodeAt: now - Rngs.int(rng, 1, 90) * 60 * 1000 } : {}),
        visitorId,
        joinedAt,
      })
      created++
    }
    // Line lengths for the waiting guests, so the first ride tick already reacts to them.
    const all = await ctx.db.query("guests").withIndex("by_park", (q) => q.eq("parkId", park._id)).collect()
    const queues = GuestSim.queueSizes(all.map((g) => ({ status: g.status, rideId: g.rideId as string | undefined })))
    for (const s of states) {
      const size = queues.get(s.rideId as string) ?? 0
      if ((s.queue ?? 0) !== size) await ctx.db.patch(s._id, { queue: size })
    }
    return created
  },
})

/**
 * Backdated visitor history for a few hours at a time: arrivals, rides with ratings and exits, shaped like a park
 * day (quiet at night, busy early afternoon). Idempotent per hour, and guarded as a whole by `demoSeededAt`.
 */
export const demoHistory = internalMutation({
  args: { fromHourAgo: v.number(), hours: v.number(), topUp: v.optional(v.boolean()) },
  handler: async (ctx, { fromHourAgo, hours, topUp }) => {
    requireDemoMode()
    const park = await parkOf(ctx)
    if (park.demoSeededAt && !topUp) return 0
    const rides = await ctx.db.query("rides").withIndex("by_park", (q) => q.eq("parkId", park._id)).collect()
    const states = await ctx.db.query("rideStates").withIndex("by_park", (q) => q.eq("parkId", park._id)).collect()
    const open = rides.map((r) => ({ id: r._id, wait: (states.find((s) => s.rideId === r._id)?.wait ?? r.minWait) as number }))
    const now = Date.now()
    let created = 0
    for (let h = fromHourAgo; h < fromHourAgo + hours && h < HISTORY_HOURS; h++) {
      const hourStart = Math.floor((now - (h + 1) * HOUR) / HOUR) * HOUR
      const hourKey = hourStart / HOUR
      const hourOfDay = new Date(hourStart).getUTCHours()
      // A crude daytime curve in UTC-5: nobody arrives at 3am, the afternoon is busiest.
      const local = (hourOfDay + 19) % 24
      const busy = local < 9 || local > 19 ? 0 : 1 + Math.sin(((local - 9) / 10) * Math.PI) * 5
      const rng = Rngs.seeded(hourKey)
      const arrivals = Math.round(busy * 2.5 * (0.7 + rng() * 0.6))
      for (let k = 0; k < arrivals; k++) {
        const key = `hist-${hourKey}-${k}`
        if (await ctx.db.query("visitors").withIndex("by_guest", (q) => q.eq("guestId", key)).first()) continue
        const enteredAt = hourStart + Rngs.int(rng, 0, HOUR - 1)
        const stay = Rngs.int(rng, 40, 240) * 60 * 1000
        const exitAt = enteredAt + stay
        const exited = exitAt < now - HOUR
        const visitorId = await ctx.db.insert("visitors", { parkId: park._id, guestId: key, enteredAt, ...(exited ? { exitedAt: exitAt } : {}) })
        await EventBus.publish(ctx, park._id, { type: "VisitorEntered", visitorId }, { dispatch: false, at: enteredAt })
        const rideCount = Rngs.int(rng, 1, 5)
        for (let r = 0; r < rideCount; r++) {
          const at = enteredAt + Math.min(stay - 1, Rngs.int(rng, 5, 60) * 60 * 1000 * (r + 1) * 0.6)
          if (at >= now) continue
          const ride = Simulator.chooseRide(open, rng)
          if (!ride) continue
          await EventBus.publish(ctx, park._id, { type: "VisitorRode", visitorId, rideId: ride.id, rating: Simulator.rate(ride.wait, rng) }, { dispatch: false, at })
        }
        if (exited) await EventBus.publish(ctx, park._id, { type: "VisitorExited", visitorId }, { dispatch: false, at: exitAt })
        created++
      }
    }
    return created
  },
})

const PAST_OUTAGES = 7

/** Several resolved outages over the last three days, and one that is still open. Guarded by `demoSeededAt`. */
export const demoOutages = internalMutation({
  args: {},
  handler: async (ctx) => {
    requireDemoMode()
    const park = await parkOf(ctx)
    if (park.demoSeededAt) return 0
    const rides = await ctx.db.query("rides").withIndex("by_park", (q) => q.eq("parkId", park._id)).collect()
    const rng = Rngs.seeded(0xbeef)
    const now = Date.now()
    const quiet = { dispatch: false }
    for (let i = 0; i < PAST_OUTAGES; i++) {
      const ride = rides[Rngs.int(rng, 0, rides.length - 1)]
      const raisedAt = now - Rngs.int(rng, 3, 66) * HOUR - Rngs.int(rng, 0, 59) * 60 * 1000
      const resolvedAt = raisedAt + Rngs.int(rng, 12, 55) * 60 * 1000
      const reason = Outages.pickReason(rng)
      await ctx.db.insert("outages", { parkId: park._id, rideId: ride._id, reason, raisedAt, lastAlertAt: raisedAt, resolvedAt })
      await EventBus.publish(ctx, park._id, { type: "RideClosed", rideId: ride._id }, { ...quiet, at: raisedAt })
      await EventBus.publish(ctx, park._id, { type: "OutageRaised", rideId: ride._id, reason }, { ...quiet, at: raisedAt })
      await EventBus.publish(ctx, park._id, { type: "RideReopened", rideId: ride._id, wait: ride.minWait }, { ...quiet, at: resolvedAt })
    }
    // One ride is down right now. The ride tick may well reopen it within minutes.
    const down = rides[Rngs.int(rng, 0, rides.length - 1)]
    const state = await ctx.db.query("rideStates").withIndex("by_ride", (q) => q.eq("rideId", down._id)).unique()
    const open = await ctx.db.query("outages").withIndex("by_ride", (q) => q.eq("rideId", down._id)).order("desc").first()
    if (state && !state.closed && !(open && open.resolvedAt === undefined)) {
      await ctx.db.patch(state._id, { closed: true, wait: 0, updatedAt: now })
      await ctx.db.insert("outages", { parkId: park._id, rideId: down._id, reason: Outages.pickReason(rng), raisedAt: now - 20 * 60 * 1000, lastAlertAt: now })
    }
    return PAST_OUTAGES + 1
  },
})

export const demoFinish = internalMutation({
  args: {},
  handler: async (ctx) => {
    requireDemoMode()
    const park = await parkOf(ctx)
    if (!park.demoSeededAt) await ctx.db.patch(park._id, { demoSeededAt: Date.now() })
  },
})

export const demoStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const park = await ctx.db.query("parks").withIndex("by_slug", (q) => q.eq("slug", PARK_SEED.slug)).unique()
    return { historySeeded: park?.demoSeededAt !== undefined }
  },
})

/**
 * Seeds the demo park: 300 named guests, three days of visitor history, past outages and one open one, and a few
 * placeholder ride photos for the demo guest accounts. Refuses unless DEMO_MODE is "true". Safe to run again.
 * `npx convex run seed:demo`
 */
export const demo = internalAction({
  args: {},
  handler: async (ctx): Promise<{ guests: number; historyVisitors: number; photos: string }> => {
    requireDemoMode()
    await ctx.runMutation(internal.seed.run, {})
    let guests = 0
    for (let from = 0; from < GUEST_COUNT; from += GUEST_BATCH) guests += await ctx.runMutation(internal.seed.demoGuests, { from, count: GUEST_BATCH })

    let historyVisitors = 0
    const { historySeeded } = await ctx.runQuery(internal.seed.demoStatus, {})
    if (!historySeeded) {
      for (let h = 0; h < HISTORY_HOURS; h += HOURS_PER_BATCH) historyVisitors += await ctx.runMutation(internal.seed.demoHistory, { fromHourAgo: h, hours: HOURS_PER_BATCH })
      await ctx.runMutation(internal.seed.demoOutages, {})
      await ctx.runMutation(internal.seed.demoFinish, {})
    }
    const photos = await ctx.runAction(internal.demoPhotos.seedAll, {})
    return { guests, historyVisitors, photos }
  },
})

const CLEAR_BATCH = 100

/** Deletes one batch of demo data. Returns how many documents it removed, so the caller loops until 0. */
export const clearBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    requireDemoMode()
    const park = await parkOf(ctx)
    let removed = 0
    const events = await ctx.db.query("parkEvents").withIndex("by_park_at", (q) => q.eq("parkId", park._id)).take(CLEAR_BATCH)
    for (const e of events) {
      if (isStatsEvent(e.payload.type)) await parkStats.deleteIfExists(ctx, e)
      await ctx.db.delete(e._id)
    }
    removed += events.length
    if (events.length > 0) return removed
    const scoped = {
      guests: () => ctx.db.query("guests").withIndex("by_park", (q) => q.eq("parkId", park._id)).take(CLEAR_BATCH),
      visitors: () => ctx.db.query("visitors").withIndex("by_park", (q) => q.eq("parkId", park._id)).take(CLEAR_BATCH),
      outages: () => ctx.db.query("outages").withIndex("by_park_resolved", (q) => q.eq("parkId", park._id)).take(CLEAR_BATCH),
    }
    for (const load of Object.values(scoped)) {
      const rows = await load()
      for (const row of rows) await ctx.db.delete(row._id)
      removed += rows.length
      if (rows.length > 0) return removed
    }
    return removed
  },
})

/** Back to a fresh park: new waits, nothing closed, empty queues, and history can be seeded again. */
export const resetRides = internalMutation({
  args: {},
  handler: async (ctx) => {
    requireDemoMode()
    const park = await parkOf(ctx)
    const rides = await ctx.db.query("rides").withIndex("by_park", (q) => q.eq("parkId", park._id)).collect()
    for (const ride of rides) {
      const state = await ctx.db.query("rideStates").withIndex("by_ride", (q) => q.eq("rideId", ride._id)).unique()
      if (state) await ctx.db.patch(state._id, { ...RideController.initial(ride, Math.random), queue: 0, updatedAt: Date.now() })
    }
    await ctx.db.patch(park._id, { demoSeededAt: undefined })
  },
})

/** Pauses the simulators for a reset and returns what to restore. The tick cannot then run against half-cleared data. */
export const beginReset = internalMutation({
  args: {},
  handler: async (ctx) => {
    requireDemoMode()
    const park = await parkOf(ctx)
    await ctx.db.patch(park._id, { simulationEnabled: false, resetStartedAt: Date.now() })
    return { simulationEnabled: park.simulationEnabled }
  },
})

/** Puts the simulation switch back as it was and clears the reset mark. */
export const endReset = internalMutation({
  args: { simulationEnabled: v.optional(v.boolean()) },
  handler: async (ctx, { simulationEnabled }) => {
    const park = await parkOf(ctx)
    await ctx.db.patch(park._id, { simulationEnabled, resetStartedAt: undefined })
  },
})

/** Wipes demo data and seeds it again. Scheduled by the admin console's "reset demo data". */
export const reset = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    requireDemoMode()
    const { simulationEnabled } = await ctx.runMutation(internal.seed.beginReset, {})
    try {
      // Bounded loop: a runaway would need over a hundred thousand documents.
      for (let i = 0; i < 2000; i++) if ((await ctx.runMutation(internal.seed.clearBatch, {})) === 0) break
      await ctx.runMutation(internal.seed.resetRides, {})
      await ctx.runAction(internal.seed.demo, {})
    } finally {
      await ctx.runMutation(internal.seed.endReset, { simulationEnabled })
    }
  },
})

const DAY = 24 * HOUR
const TOP_UP_AFTER_MS = DAY

/** What the daily top-up needs to know: is demo mode on, is there seeded history, and how many hours are missing. */
export const topUpStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const park = await ctx.db.query("parks").withIndex("by_slug", (q) => q.eq("slug", PARK_SEED.slug)).unique()
    if (!flags().demoMode || !park?.demoSeededAt || park.resetStartedAt !== undefined) return { hours: 0 }
    const age = Date.now() - park.demoSeededAt
    return { hours: age < TOP_UP_AFTER_MS ? 0 : Math.min(HISTORY_HOURS, Math.ceil(age / HOUR)) }
  },
})

export const demoTouch = internalMutation({
  args: {},
  handler: async (ctx) => {
    requireDemoMode()
    const park = await parkOf(ctx)
    await ctx.db.patch(park._id, { demoSeededAt: Date.now() })
  },
})

/**
 * Daily cron. The event log keeps three days, so on a demo deployment the seeded history would decay. When the last
 * seed is over a day old this adds the hours since, at most 66 and three hours per mutation, and the next `prune`
 * drops what has aged out. Does nothing outside demo mode.
 */
export const topUpHistory = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const { hours } = await ctx.runQuery(internal.seed.topUpStatus, {})
    let created = 0
    for (let h = 0; h < hours; h += HOURS_PER_BATCH) created += await ctx.runMutation(internal.seed.demoHistory, { fromHourAgo: h, hours: HOURS_PER_BATCH, topUp: true })
    if (hours > 0) await ctx.runMutation(internal.seed.demoTouch, {})
    return created
  },
})
