import { EventBus } from "./lib/eventBus"
import { Outages } from "../src/domain/outages.ts"

/**
 * Outage subscriber. Ports the upstream `outages` Lambda (aws-samples/aws-serverless-workshop-innovator-island, MIT-0).
 * Upstream cached recent alerts in a warm container and matched on `hasOwnProperty("rideId")`; we look at the
 * `outages` row for the ride instead, so a repeat delivery does nothing.
 */
EventBus.subscribe({
  name: "outages.open",
  type: "RideClosed",
  handle: async (ctx, event) => {
    const { rideId } = event.payload
    const now = Date.now()
    const open = await ctx.db
      .query("outages")
      .withIndex("by_ride", (q) => q.eq("rideId", rideId))
      .order("desc")
      .first()

    // RideClosed only fires on an open to closed transition, so an open outage means this is a repeat delivery.
    if (open && open.resolvedAt === undefined) return

    const reason = Outages.pickReason(Math.random)
    await ctx.db.insert("outages", { parkId: event.parkId, rideId, reason, raisedAt: now, lastAlertAt: now })
    await EventBus.publish(ctx, event.parkId, { type: "OutageRaised", rideId, reason })
  },
})

EventBus.subscribe({
  name: "outages.resolve",
  type: "RideReopened",
  handle: async (ctx, event) => {
    const open = await ctx.db
      .query("outages")
      .withIndex("by_ride", (q) => q.eq("rideId", event.payload.rideId))
      .order("desc")
      .first()
    if (open && open.resolvedAt === undefined) await ctx.db.patch(open._id, { resolvedAt: Date.now() })
  },
})
