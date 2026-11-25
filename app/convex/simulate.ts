import { internalMutation } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { EventBus } from "./lib/eventBus"
import { FACILITIES } from "../src/domain/facilities.ts"
import { GuestSim } from "../src/domain/guests.ts"
import { Simulator } from "../src/domain/simulator.ts"

/** Hard cap on named-guest rows written per run, so the park costs the same however many guests it holds. */
export const MAX_GUEST_UPDATES = 60

/** Hard cap on anonymous visitors handled per run, so their writes cost the same however many are in the park. */
export const MAX_VISITOR_UPDATES = 150

const DINING_IDS = FACILITIES.filter((f) => f.kind === "dining").map((f) => f.id)

/**
 * One step of the named guests. At most MAX_GUEST_UPDATES guests change per run, picked at random, so everyone
 * moves every few runs. Rides, dining and exits are real events: a finished ride is a `VisitorRode` in the stats.
 * Queue lengths are written to `rideStates.queue` (only where they changed), and the ride tick reads them.
 */
async function guestsStep(ctx: MutationCtx, park: Doc<"parks">): Promise<number> {
  const guests = await ctx.db.query("guests").withIndex("by_park", (q) => q.eq("parkId", park._id)).collect()
  if (guests.length === 0) return 0
  const states = await ctx.db.query("rideStates").withIndex("by_park", (q) => q.eq("parkId", park._id)).collect()
  const world = {
    openRides: states.filter((s) => !s.closed).map((s) => ({ id: s.rideId as string, wait: s.wait })),
    rideIds: states.map((s) => s.rideId as string),
    diningIds: DINING_IDS,
  }
  const waitByRide = new Map(states.map((s) => [s.rideId as string, s.wait]))
  const rng = Math.random
  const now = Date.now()

  // A partial shuffle: the first MAX_GUEST_UPDATES guests that actually move are written, the rest wait for next run.
  const order = guests.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  const quiet = { dispatch: false }
  const current = new Map(guests.map((g) => [g._id, g] as const))
  let updates = 0
  for (const index of order) {
    if (updates >= MAX_GUEST_UPDATES) break
    const guest = guests[index]
    const move = GuestSim.step({ ...guest, rideId: guest.rideId as string | undefined }, world, rng)
    if (!move) continue
    const { state } = move
    const patch: Partial<Doc<"guests">> = {
      status: state.status,
      rideId: state.rideId as Id<"rides"> | undefined,
      facilityId: state.facilityId,
      walkFrom: state.walkFrom,
      walkTo: state.walkTo,
      stateSince: now,
    }
    if (move.effect === "rode" && guest.rideId) {
      patch.totalRides = guest.totalRides + 1
      patch.lastRideId = guest.rideId
      patch.lastRodeAt = now
      if (guest.visitorId)
        await EventBus.publish(
          ctx,
          park._id,
          { type: "VisitorRode", visitorId: guest.visitorId, rideId: guest.rideId, rating: Simulator.rate(waitByRide.get(guest.rideId) ?? 0, rng) },
          quiet,
        )
    } else if (move.effect === "left" && guest.visitorId) {
      await ctx.db.patch(guest.visitorId, { exitedAt: now })
      await EventBus.publish(ctx, park._id, { type: "VisitorExited", visitorId: guest.visitorId }, quiet)
      patch.visitorId = undefined
    } else if (move.effect === "entered") {
      const visitorId = await ctx.db.insert("visitors", { parkId: park._id, guestId: guest.slug, enteredAt: now })
      await EventBus.publish(ctx, park._id, { type: "VisitorEntered", visitorId }, quiet)
      patch.visitorId = visitorId
    }
    await ctx.db.patch(guest._id, patch)
    current.set(guest._id, { ...guest, ...patch } as Doc<"guests">)
    updates++
  }

  const queues = GuestSim.queueSizes([...current.values()].map((g) => ({ status: g.status, rideId: g.rideId as string | undefined })))
  for (const s of states) {
    const size = queues.get(s.rideId as string) ?? 0
    if ((s.queue ?? 0) !== size) await ctx.db.patch(s._id, { queue: size })
  }
  return updates
}

/**
 * One step of the visitor simulator. Upstream's Lambda simulated up to 30k visitors a day into Firehose.
 * This keeps at most a few hundred in the park, writes `parkEvents`, and skips parks that are paused.
 * It also moves the named guests (see `guestsStep`).
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
      // Named guests have their own visitors rows and move in guestsStep, so the anonymous crowd skips them.
      const anonymous = inPark.filter((v) => !v.guestId.startsWith("guest-"))

      const quiet = { dispatch: false }
      // A random starting point, so when there are more than the cap everyone still gets a turn over a few runs.
      const start = Math.floor(rng() * anonymous.length)
      const turn = anonymous.length > MAX_VISITOR_UPDATES ? [...anonymous.slice(start), ...anonymous.slice(0, start)].slice(0, MAX_VISITOR_UPDATES) : anonymous
      for (const visitor of turn) {
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

      const arrivals = Simulator.arrivals(anonymous.length, rng)
      for (let i = 0; i < arrivals; i++) {
        const guestId = `sim-${Math.random().toString(36).slice(2, 10)}`
        const visitorId = await ctx.db.insert("visitors", { parkId: park._id, guestId, enteredAt: Date.now() })
        await EventBus.publish(ctx, park._id, { type: "VisitorEntered", visitorId }, quiet)
        events++
      }
      events += await guestsStep(ctx, park)
    }
    return events
  },
})
