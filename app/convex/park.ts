import { v } from "convex/values"
import { internalMutation } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { EventBus } from "./lib/eventBus"
import { RideController } from "../src/domain/ride-controller.ts"

async function tickPark(ctx: MutationCtx, parkId: Id<"parks">): Promise<number> {
  const rides = await ctx.db.query("rides").withIndex("by_park", (q) => q.eq("parkId", parkId)).collect()
  const states = await ctx.db.query("rideStates").withIndex("by_park", (q) => q.eq("parkId", parkId)).collect()
  const stateByRide = new Map(states.map((s) => [s.rideId, s]))
  const now = Date.now()
  let events = 0

  for (const ride of rides) {
    const state = stateByRide.get(ride._id)
    if (!state) continue
    const next = RideController.step(ride, state, Math.random, state.queue ?? 0)
    // Every subscriber of rides.list re-renders on a patch, so write only when something changed.
    if (next.transition !== "none") {
      await ctx.db.patch(state._id, { wait: next.wait, targetWait: next.targetWait, closed: next.closed, updatedAt: now })
    } else if (next.targetWait !== state.targetWait) {
      await ctx.db.patch(state._id, { targetWait: next.targetWait })
    }

    if (next.transition === "wait-changed") {
      await EventBus.publish(ctx, parkId, { type: "RideWaitChanged", rideId: ride._id, wait: next.wait, previousWait: state.wait })
    } else if (next.transition === "closed") {
      await EventBus.publish(ctx, parkId, { type: "RideClosed", rideId: ride._id })
    } else if (next.transition === "reopened") {
      await EventBus.publish(ctx, parkId, { type: "RideReopened", rideId: ride._id, wait: next.wait })
    }
    if (next.transition !== "none") events++
  }
  return events
}

/**
 * The single entry point that advances a park by one step. A cron calls it with no args (every park); a workflow
 * or an agent loop can later call it for one park. Upstream: the EventBridge `rate(1 minute)` -> FATcontroller Lambda.
 */
export const tick = internalMutation({
  args: { parkId: v.optional(v.id("parks")) },
  handler: async (ctx, { parkId }) => {
    const parks = parkId ? [await ctx.db.get(parkId)] : await ctx.db.query("parks").collect()
    // A paused park keeps its state and costs nothing until it is switched back on.
    const parkIds = parks.flatMap((p) => (p && p.simulationEnabled !== false ? [p._id] : []))
    let events = 0
    for (const id of parkIds) events += await tickPark(ctx, id)
    return events
  },
})

/**
 * Pause or resume the ride tick and the visitor simulator, to stay inside the free tier.
 * `npx convex run park:setSimulation '{"enabled": false}'`
 */
export const setSimulation = internalMutation({
  args: { enabled: v.boolean(), parkSlug: v.optional(v.string()) },
  handler: async (ctx, { enabled, parkSlug }) => {
    const slug = parkSlug ?? "innovator-island"
    const park = await ctx.db.query("parks").withIndex("by_slug", (q) => q.eq("slug", slug)).unique()
    if (!park) return false
    await ctx.db.patch(park._id, { simulationEnabled: enabled })
    return true
  },
})
