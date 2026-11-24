import { internalMutation } from "./_generated/server"
import { EventBus } from "./lib/eventBus"
import { Simulator } from "../src/domain/simulator.ts"

/**
 * One step of the visitor simulator. Upstream's Lambda simulated up to 30k visitors a day into Firehose.
 * This keeps at most a few hundred in the park, writes `parkEvents`, and skips parks that are paused.
 */
export const visitorsTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const parks = await ctx.db.query("parks").collect()
    let events = 0
    for (const park of parks) {
      if (park.simulationEnabled === false) continue
      const rng = Math.random
      const states = await ctx.db.query("rideStates").withIndex("by_park", (q) => q.eq("parkId", park._id)).collect()
      const open = states.filter((s) => !s.closed).map((s) => ({ id: s.rideId, wait: s.wait }))
      const inPark = await ctx.db
        .query("visitors")
        .withIndex("by_park_exited", (q) => q.eq("parkId", park._id).eq("exitedAt", undefined))
        .collect()

      const quiet = { dispatch: false }
      for (const visitor of inPark) {
        if (Simulator.wantsToExit(rng)) {
          await ctx.db.patch(visitor._id, { exitedAt: Date.now() })
          await EventBus.publish(ctx, park._id, { type: "VisitorExited", visitorId: visitor._id }, quiet)
          events++
        } else if (Simulator.wantsToRide(rng)) {
          const ride = Simulator.chooseRide(open, rng)
          if (!ride) continue
          await EventBus.publish(
            ctx,
            park._id,
            { type: "VisitorRode", visitorId: visitor._id, rideId: ride.id, rating: Simulator.rate(ride.wait, rng) },
            quiet,
          )
          events++
        }
      }

      const arrivals = Simulator.arrivals(inPark.length, rng)
      for (let i = 0; i < arrivals; i++) {
        const guestId = `sim-${Math.random().toString(36).slice(2, 10)}`
        const visitorId = await ctx.db.insert("visitors", { parkId: park._id, guestId, enteredAt: Date.now() })
        await EventBus.publish(ctx, park._id, { type: "VisitorEntered", visitorId }, quiet)
        events++
      }
    }
    return events
  },
})
