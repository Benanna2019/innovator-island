import { ConvexError, v } from "convex/values"
import { internal } from "./_generated/api"
import { mutation, query } from "./_generated/server"
import { requireAdmin } from "./lib/auth"
import { flags } from "./lib/config"
import { EventBus } from "./lib/eventBus"
import { rateLimiter } from "./lib/limits"
import { PARK_SEED } from "../src/domain/rides-seed.ts"

const MAX_WAIT_LIMIT = 240
/** A reset in flight blocks another for this long, in case the action died before it could clear the mark. */
const RESET_LOCK_MS = 10 * 60 * 1000

/** Everything the operator console shows. Admin only: the role is checked here, not in the UI. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)
    const park = await ctx.db.query("parks").withIndex("by_slug", (q) => q.eq("slug", PARK_SEED.slug)).unique()
    if (!park) return null
    const rides = await ctx.db.query("rides").withIndex("by_park", (q) => q.eq("parkId", park._id)).collect()
    const states = await ctx.db.query("rideStates").withIndex("by_park", (q) => q.eq("parkId", park._id)).collect()
    const byRide = new Map(states.map((s) => [s.rideId, s]))
    return {
      simulationEnabled: park.simulationEnabled !== false,
      demoMode: flags().demoMode,
      rides: rides
        .map((r) => ({
          id: r._id,
          name: r.name,
          minWait: r.minWait,
          maxWait: r.maxWait,
          closureProbability: r.closureProbability,
          wait: byRide.get(r._id)?.wait ?? 0,
          closed: byRide.get(r._id)?.closed ?? false,
          queue: byRide.get(r._id)?.queue ?? 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }
  },
})

async function loadPark(ctx: Parameters<typeof requireAdmin>[0]) {
  const park = await ctx.db.query("parks").withIndex("by_slug", (q) => q.eq("slug", PARK_SEED.slug)).unique()
  if (!park) throw new ConvexError({ code: "NoPark" })
  return park
}

/** Pause or resume the ride tick and the guest simulators. */
export const setSimulation = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    await requireAdmin(ctx)
    await rateLimiter.limit(ctx, "adminWrite", { throws: true })
    const park = await loadPark(ctx)
    await ctx.db.patch(park._id, { simulationEnabled: enabled })
  },
})

/** Closes a ride now. The outage subscriber opens the outage row and raises the alert, as for a random closure. */
export const triggerOutage = mutation({
  args: { rideId: v.id("rides") },
  handler: async (ctx, { rideId }) => {
    await requireAdmin(ctx)
    await rateLimiter.limit(ctx, "adminWrite", { throws: true })
    const ride = await ctx.db.get(rideId)
    const state = await ctx.db.query("rideStates").withIndex("by_ride", (q) => q.eq("rideId", rideId)).unique()
    if (!ride || !state) throw new ConvexError({ code: "NoRide" })
    if (state.closed) return { changed: false }
    await ctx.db.patch(state._id, { closed: true, wait: 0, updatedAt: Date.now() })
    await EventBus.publish(ctx, ride.parkId, { type: "RideClosed", rideId })
    return { changed: true }
  },
})

/** Reopens a closed ride at its minimum wait and resolves its outage. */
export const reopenRide = mutation({
  args: { rideId: v.id("rides") },
  handler: async (ctx, { rideId }) => {
    await requireAdmin(ctx)
    await rateLimiter.limit(ctx, "adminWrite", { throws: true })
    const ride = await ctx.db.get(rideId)
    const state = await ctx.db.query("rideStates").withIndex("by_ride", (q) => q.eq("rideId", rideId)).unique()
    if (!ride || !state) throw new ConvexError({ code: "NoRide" })
    if (!state.closed) return { changed: false }
    await ctx.db.patch(state._id, { closed: false, wait: ride.minWait, updatedAt: Date.now() })
    await EventBus.publish(ctx, ride.parkId, { type: "RideReopened", rideId, wait: ride.minWait })
    return { changed: true }
  },
})

/** Edits the two numbers an operator tunes: the longest wait and the chance a ride closes each tick. */
export const updateRide = mutation({
  args: { rideId: v.id("rides"), maxWait: v.number(), closureProbability: v.number() },
  handler: async (ctx, { rideId, maxWait, closureProbability }) => {
    await requireAdmin(ctx)
    await rateLimiter.limit(ctx, "adminWrite", { throws: true })
    const ride = await ctx.db.get(rideId)
    if (!ride) throw new ConvexError({ code: "NoRide" })
    if (!Number.isInteger(maxWait) || maxWait < ride.minWait || maxWait > MAX_WAIT_LIMIT)
      throw new ConvexError({ code: "BadMaxWait", min: ride.minWait, max: MAX_WAIT_LIMIT })
    if (!(closureProbability >= 0 && closureProbability <= 1)) throw new ConvexError({ code: "BadProbability" })
    await ctx.db.patch(rideId, { maxWait, closureProbability })
  },
})

/** Wipes the demo guests and history, then seeds them again. Only on a demo deployment, one at a time and at most once every five minutes. */
export const resetDemo = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)
    if (!flags().demoMode) throw new ConvexError({ code: "NotDemo" })
    const park = await loadPark(ctx)
    // One reset at a time: a second one would interleave its deletes with the first one's reseed.
    if (park.resetStartedAt !== undefined && Date.now() - park.resetStartedAt < RESET_LOCK_MS) throw new ConvexError({ code: "ResetRunning" })
    await rateLimiter.limit(ctx, "adminReset", { throws: true })
    await ctx.db.patch(park._id, { resetStartedAt: Date.now() })
    await ctx.scheduler.runAfter(0, internal.seed.reset, {})
  },
})
