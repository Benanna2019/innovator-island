import { v } from "convex/values"
import { query } from "./_generated/server"
import type { Doc } from "./_generated/dataModel"

const toView = (g: Doc<"guests">) => ({
  id: g._id,
  name: g.name,
  initials: g.initials,
  hue: g.avatarHue,
  language: g.language,
})

const WALKERS_SHOWN = 8
const QUEUE_PREVIEW = 3

/**
 * Live guests for the map: a count and a few faces per queue, and some walking guests with the two places they are
 * walking between. Guests are simulated people, so names and faces are public.
 */
export const onMap = query({
  args: { parkSlug: v.string() },
  handler: async (ctx, { parkSlug }) => {
    const park = await ctx.db.query("parks").withIndex("by_slug", (q) => q.eq("slug", parkSlug)).unique()
    if (!park) return null
    const guests = await ctx.db.query("guests").withIndex("by_park", (q) => q.eq("parkId", park._id)).collect()
    const queues = new Map<string, { count: number; faces: ReturnType<typeof toView>[] }>()
    const walkers: (ReturnType<typeof toView> & { from: string | null; to: string | null; since: number })[] = []
    let inPark = 0
    for (const g of guests) {
      if (g.status !== "left") inPark++
      if (g.status === "queuing" && g.rideId) {
        const entry = queues.get(g.rideId) ?? { count: 0, faces: [] }
        entry.count++
        if (entry.faces.length < QUEUE_PREVIEW) entry.faces.push(toView(g))
        queues.set(g.rideId, entry)
      } else if (g.status === "walking" && walkers.length < WALKERS_SHOWN) {
        walkers.push({ ...toView(g), from: g.walkFrom ?? null, to: g.walkTo ?? null, since: g.stateSince })
      }
    }
    return {
      inPark,
      queues: Object.fromEntries(queues),
      walkers,
    }
  },
})

const RIDER_LIST = 40
const RECENT = 8

/** Who is in line for one ride, and who rode it lately. */
export const forRide = query({
  args: { parkSlug: v.string(), rideSlug: v.string() },
  handler: async (ctx, { parkSlug, rideSlug }) => {
    const park = await ctx.db.query("parks").withIndex("by_slug", (q) => q.eq("slug", parkSlug)).unique()
    if (!park) return null
    const ride = await ctx.db.query("rides").withIndex("by_park_slug", (q) => q.eq("parkId", park._id).eq("slug", rideSlug)).unique()
    if (!ride) return null
    const inLine = await ctx.db.query("guests").withIndex("by_ride_status", (q) => q.eq("rideId", ride._id).eq("status", "queuing")).take(RIDER_LIST)
    const riding = await ctx.db.query("guests").withIndex("by_ride_status", (q) => q.eq("rideId", ride._id).eq("status", "riding")).take(RECENT)
    const recent = await ctx.db.query("guests").withIndex("by_last_ride", (q) => q.eq("lastRideId", ride._id)).order("desc").take(RECENT)
    return {
      queue: inLine.map(toView),
      riding: riding.map(toView),
      recent: recent.map((g) => ({ ...toView(g), at: g.lastRodeAt ?? 0 })),
    }
  },
})
