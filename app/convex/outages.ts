import { v } from "convex/values"
import { query } from "./_generated/server"

/** Open outages for the banner. Upstream pushed these to browsers over IoT MQTT. */
export const active = query({
  args: { parkSlug: v.string() },
  handler: async (ctx, { parkSlug }) => {
    const park = await ctx.db.query("parks").withIndex("by_slug", (q) => q.eq("slug", parkSlug)).unique()
    if (!park) return []
    const open = await ctx.db
      .query("outages")
      .withIndex("by_park_resolved", (q) => q.eq("parkId", park._id).eq("resolvedAt", undefined))
      .collect()
    const out = []
    for (const o of open) {
      const ride = await ctx.db.get(o.rideId)
      if (ride) out.push({ id: o._id, rideName: ride.name, reason: o.reason, raisedAt: o.raisedAt })
    }
    return out.sort((a, b) => a.raisedAt - b.raisedAt)
  },
})
