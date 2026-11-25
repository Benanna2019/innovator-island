import { v } from "convex/values"
import { internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"
import { EventBus } from "./lib/eventBus"
import { isStatsEvent, parkStats } from "./lib/parkStats"
// Importing registers the subscribers on the bus.
import "./subscribers"

export const dispatch = internalMutation({
  args: { eventId: v.id("parkEvents") },
  handler: async (ctx, { eventId }) => {
    await EventBus.dispatch(ctx, eventId)
  },
})

const DAY = 24 * 60 * 60 * 1000
/** How long the event log is kept. The stats page counts what is left, so its totals cover this window. */
export const EVENT_RETENTION_MS = 3 * DAY
const PRUNE_BATCH = 200

/**
 * Daily retention for `parkEvents`, oldest first through `by_park_at`. Stats events leave the `parkStats` aggregate
 * in the same mutation, so it never drifts from the table. A full batch schedules another pass.
 */
export const prune = internalMutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    const cutoff = Date.now() - EVENT_RETENTION_MS
    let deleted = 0
    for (const park of await ctx.db.query("parks").collect()) {
      const old = await ctx.db
        .query("parkEvents")
        .withIndex("by_park_at", (q) => q.eq("parkId", park._id).lt("at", cutoff))
        .take(PRUNE_BATCH)
      for (const event of old) {
        if (isStatsEvent(event.payload.type)) await parkStats.deleteIfExists(ctx, event)
        // The visitor row goes with its arrival event, so `visitors` stays in step with the aggregate. A visitor
        // still in the park (no exit yet) is kept: the simulators and named guests still point at it.
        if (event.payload.type === "VisitorEntered") {
          const visitor = await ctx.db.get(event.payload.visitorId)
          if (visitor && visitor.exitedAt !== undefined) await ctx.db.delete(visitor._id)
        }
        await ctx.db.delete(event._id)
      }
      deleted += old.length
    }
    if (deleted >= PRUNE_BATCH) await ctx.scheduler.runAfter(0, internal.events.prune, {})
    return deleted
  },
})
