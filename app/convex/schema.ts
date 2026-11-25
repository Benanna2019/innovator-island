import { authTables } from "@convex-dev/auth/server"
import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export const role = v.union(v.literal("admin"), v.literal("guest"))
export const guestStatus = v.union(
  v.literal("walking"),
  v.literal("queuing"),
  v.literal("riding"),
  v.literal("dining"),
  v.literal("left"),
)
export const guestLanguage = v.union(v.literal("en"), v.literal("fr"), v.literal("es"), v.literal("ja"))

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
  ...authTables,

  // The auth users table plus a role. A missing role means "guest", so sign-up needs no extra write.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(role),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  parks: defineTable({
    slug: v.string(),
    name: v.string(),
    // Pauses the ride tick and the visitor simulator. Missing means on.
    simulationEnabled: v.optional(v.boolean()),
    // Set once the demo history (visitor events, outages) has been seeded, so `seed:demo` does not repeat it.
    demoSeededAt: v.optional(v.number()),
    // Set while a demo reset runs, so a second one is refused. Cleared when it finishes.
    resetStartedAt: v.optional(v.number()),
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
    // Named guests waiting in line, kept here by the guest simulator so the ride tick does not read the guests table.
    queue: v.optional(v.number()),
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

  // The simulated park guests with names: what the map, the ride queues and the language stats show.
  guests: defineTable({
    parkId: v.id("parks"),
    // Stable key, so seeding twice finds the same guest.
    slug: v.string(),
    name: v.string(),
    language: guestLanguage,
    // Avatar spec rendered client-side as an SVG: no external avatar service.
    avatarHue: v.number(),
    initials: v.string(),
    status: guestStatus,
    // Set while queuing or riding.
    rideId: v.optional(v.id("rides")),
    // Set while dining: an id from src/domain/facilities.ts.
    facilityId: v.optional(v.string()),
    // Where a walking guest is heading, so the map can place them between two points.
    walkFrom: v.optional(v.string()),
    walkTo: v.optional(v.string()),
    stateSince: v.number(),
    favoriteRideIds: v.array(v.id("rides")),
    totalRides: v.number(),
    lastRideId: v.optional(v.id("rides")),
    lastRodeAt: v.optional(v.number()),
    // The `visitors` row for the current stay, so a ride or an exit is also a stats event.
    visitorId: v.optional(v.id("visitors")),
    joinedAt: v.number(),
  })
    .index("by_park", ["parkId"])
    .index("by_slug", ["parkId", "slug"])
    .index("by_ride_status", ["rideId", "status"])
    .index("by_last_ride", ["lastRideId", "lastRodeAt"]),

  photos: defineTable({
    parkId: v.id("parks"),
    // The signed-in user who owns the photo. Optional only so rows made under the old guest-cookie model still
    // validate on a deployment that had them. New rows always set it, and rows without it are never shown.
    userId: v.optional(v.id("users")),
    // Legacy: the guest-cookie id from before uploads needed a login. Nothing reads or writes it now.
    guestId: v.optional(v.string()),
    status: v.union(v.literal("uploaded"), v.literal("processing"), v.literal("ready"), v.literal("failed")),
    originalId: v.optional(v.id("_storage")),
    keyedId: v.optional(v.id("_storage")),
    composedId: v.optional(v.id("_storage")),
    finalId: v.optional(v.id("_storage")),
    // The tag of the Effect error that stopped the pipeline, for example "ChromaKeyFailed".
    failure: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
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
