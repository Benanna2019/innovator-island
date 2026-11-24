import { v } from "convex/values"
import { query } from "./_generated/server"
import { parkStats } from "./lib/parkStats"

const HOUR = 60 * 60 * 1000
const HOURS_SHOWN = 12

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

    return {
      park: { name: park.name, paused: park.simulationEnabled === false },
      headcount: entered - exited,
      totalVisitors: entered,
      totalRides: rides,
      averageRating: rides === 0 ? null : Math.round((ratingSum / rides) * 100) / 100,
      ridesPerHour: starts.map((from, i) => ({ from, rides: counts[i] })),
    }
  },
})
