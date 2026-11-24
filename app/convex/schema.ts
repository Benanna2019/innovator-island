import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export const parkEventPayload = v.union(
  v.object({ type: v.literal("RideWaitChanged"), rideId: v.id("rides"), wait: v.number(), previousWait: v.number() }),
  v.object({ type: v.literal("RideClosed"), rideId: v.id("rides") }),
  v.object({ type: v.literal("RideReopened"), rideId: v.id("rides"), wait: v.number() }),
  v.object({ type: v.literal("OutageRaised"), rideId: v.id("rides"), reason: v.string() }),
  v.object({ type: v.literal("VisitorEntered"), visitorId: v.id("visitors") }),
  v.object({ type: v.literal("VisitorRode"), visitorId: v.id("visitors"), rideId: v.id("rides"), rating: v.number() }),
  v.object({ type: v.literal("VisitorExited"), visitorId: v.id("visitors") }),
)

export default defineSchema({
  parks: defineTable({
    slug: v.string(),
    name: v.string(),
    // Pauses the ride tick and the visitor simulator. Missing means on.
    simulationEnabled: v.optional(v.boolean()),
  }).index("by_slug", ["slug"]),

  // Static ride config. Mutable state lives in rideStates so config stays cacheable.
  rides: defineTable({
    parkId: v.id("parks"),
    slug: v.string(),
    name: v.string(),
    minWait: v.number(),
    maxWait: v.number(),
    waitChangeRate: v.number(),
    closureProbability: v.number(),
    // Map position as a percentage of the map width and height.
    x: v.number(),
    y: v.number(),
    // File name (without extension) of the icon in public/park/rides. Missing on rides seeded before icons existed.
    icon: v.optional(v.string()),
  })
    .index("by_park", ["parkId"])
    .index("by_park_slug", ["parkId", "slug"]),

  rideStates: defineTable({
    parkId: v.id("parks"),
    rideId: v.id("rides"),
    wait: v.number(),
    targetWait: v.number(),
    closed: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_ride", ["rideId"])
    .index("by_park", ["parkId"]),

  // The event log. Everything that happens in a park is one typed row here, for phase 1 subscribers and phase 2 agents.
  parkEvents: defineTable({
    parkId: v.id("parks"),
    at: v.number(),
    payload: parkEventPayload,
    // Set once a subscriber has handled the event, so handlers are idempotent.
    handledBy: v.optional(v.array(v.string())),
  }).index("by_park_at", ["parkId", "at"]),

  visitors: defineTable({
    parkId: v.id("parks"),
    guestId: v.string(),
    enteredAt: v.number(),
    exitedAt: v.optional(v.number()),
  })
    .index("by_park", ["parkId"])
    .index("by_park_exited", ["parkId", "exitedAt"])
    .index("by_guest", ["guestId"]),

  photos: defineTable({
    parkId: v.id("parks"),
    guestId: v.string(),
    status: v.union(v.literal("uploaded"), v.literal("processing"), v.literal("ready"), v.literal("failed")),
    originalId: v.optional(v.id("_storage")),
    keyedId: v.optional(v.id("_storage")),
    composedId: v.optional(v.id("_storage")),
    finalId: v.optional(v.id("_storage")),
    // The tag of the Effect error that stopped the pipeline, for example "ChromaKeyFailed".
    failure: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_guest", ["guestId"])
    .index("by_original", ["originalId"])
    .index("by_keyed", ["keyedId"])
    .index("by_composed", ["composedId"])
    .index("by_final", ["finalId"]),

  outages: defineTable({
    parkId: v.id("parks"),
    rideId: v.id("rides"),
    reason: v.string(),
    raisedAt: v.number(),
    lastAlertAt: v.number(),
    // Present once the ride is back.
    resolvedAt: v.optional(v.number()),
  })
    .index("by_ride", ["rideId"])
    .index("by_park_resolved", ["parkId", "resolvedAt"]),
})
