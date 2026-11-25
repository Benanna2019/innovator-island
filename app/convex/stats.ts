import { v } from "convex/values"
import { query } from "./_generated/server"
import { parkStats } from "./lib/parkStats"

const HOUR = 60 * 60 * 1000
const HOURS_SHOWN = 12
const OVER_TIME_HOURS = 24

/**
 * The stats page. Upstream's answer was Kinesis Firehose, S3, Athena and a QuickSight dashboard; here each number is
 * a range query over the `parkStats` aggregate, so it is live and costs O(log n).
 */
export const summary = query({
  args: { parkSlug: v.string() },
  handler: async (ctx, { parkSlug }) => {
    const park = await ctx.db.query("parks").withIndex("by_slug", (q) => q.eq("slug", parkSlug)).unique()
    if (!park) return null
    const namespace = park._id
    const [entered, exited, rides, ratingSum] = await Promise.all([
      parkStats.count(ctx, { namespace, bounds: { prefix: ["VisitorEntered"] } }),
      parkStats.count(ctx, { namespace, bounds: { prefix: ["VisitorExited"] } }),
      parkStats.count(ctx, { namespace, bounds: { prefix: ["VisitorRode"] } }),
      parkStats.sum(ctx, { namespace, bounds: { prefix: ["VisitorRode"] } }),
    ])

    const now = Date.now()
    const starts = Array.from({ length: HOURS_SHOWN }, (_, i) => now - (HOURS_SHOWN - i) * HOUR)
    const counts = await parkStats.countBatch(
      ctx,
      starts.map((from) => ({
        namespace,
        bounds: {
          lower: { key: ["VisitorRode", from] as [string, number], inclusive: true },
          upper: { key: ["VisitorRode", from + HOUR] as [string, number], inclusive: false },
        },
      })),
    )

    // Headcount at the top of each of the last 24 hours: entered minus exited up to that moment.
    const edges = Array.from({ length: OVER_TIME_HOURS }, (_, i) => now - (OVER_TIME_HOURS - 1 - i) * HOUR)
    const upTo = (type: string, at: number) => ({ namespace, bounds: { upper: { key: [type, at] as [string, number], inclusive: true }, lower: { key: [type, 0] as [string, number], inclusive: true } } })
    const [enteredBy, exitedBy] = await Promise.all([
      parkStats.countBatch(ctx, edges.map((at) => upTo("VisitorEntered", at))),
      parkStats.countBatch(ctx, edges.map((at) => upTo("VisitorExited", at))),
    ])

    const guests = await ctx.db.query("guests").withIndex("by_park", (q) => q.eq("parkId", park._id)).collect()
    const languages = { en: 0, fr: 0, es: 0, ja: 0 }
    let guestsInPark = 0
    for (const g of guests) {
      languages[g.language]++
      if (g.status !== "left") guestsInPark++
    }

    return {
      languages,
      guestsInPark,
      headcountOverTime: edges.map((at, i) => ({ at, headcount: Math.max(0, enteredBy[i] - exitedBy[i]) })),
      park: { name: park.name, paused: park.simulationEnabled === false },
      headcount: entered - exited,
      totalVisitors: entered,
      totalRides: rides,
      averageRating: rides === 0 ? null : Math.round((ratingSum / rides) * 100) / 100,
      ridesPerHour: starts.map((from, i) => ({ from, rides: counts[i] })),
    }
  },
})
