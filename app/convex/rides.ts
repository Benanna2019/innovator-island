import { v } from "convex/values"
import { query } from "./_generated/server"

/** The park map and list read this. Reactive, so it replaces upstream's `getInitState` API plus the IoT push. */
export const list = query({
  args: { parkSlug: v.string() },
  handler: async (ctx, { parkSlug }) => {
    const park = await ctx.db.query("parks").withIndex("by_slug", (q) => q.eq("slug", parkSlug)).unique()
    if (!park) return null
    const rides = await ctx.db.query("rides").withIndex("by_park", (q) => q.eq("parkId", park._id)).collect()
    const states = await ctx.db.query("rideStates").withIndex("by_park", (q) => q.eq("parkId", park._id)).collect()
    const stateByRide = new Map(states.map((s) => [s.rideId, s]))
    return {
      park: { name: park.name, slug: park.slug },
      rides: rides
        .map((r) => {
          const s = stateByRide.get(r._id)
          return { id: r._id, slug: r.slug, name: r.name, x: r.x, y: r.y, icon: r.icon ?? null, wait: s?.wait ?? 0, closed: s?.closed ?? false, updatedAt: s?.updatedAt ?? 0 }
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    }
  },
})
