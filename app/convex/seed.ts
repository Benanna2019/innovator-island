import { internalMutation } from "./_generated/server"
import { PARK_SEED, RIDE_SEEDS } from "../src/domain/rides-seed.ts"
import { RideController } from "../src/domain/ride-controller.ts"

/** Idempotent. Run with `npx convex run seed:run`. Existing rides are updated to the current name, icon and position. */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const park = await ctx.db.query("parks").withIndex("by_slug", (q) => q.eq("slug", PARK_SEED.slug)).unique()
    const parkId = park?._id ?? (await ctx.db.insert("parks", { ...PARK_SEED }))
    let created = 0
    let updated = 0
    for (const { legacySlugs, ...seed } of RIDE_SEEDS) {
      let existing = null
      for (const slug of [seed.slug, ...legacySlugs]) {
        existing = await ctx.db
          .query("rides")
          .withIndex("by_park_slug", (q) => q.eq("parkId", parkId).eq("slug", slug))
          .unique()
        if (existing) break
      }
      if (existing) {
        await ctx.db.patch(existing._id, { slug: seed.slug, name: seed.name, icon: seed.icon, x: seed.x, y: seed.y })
        updated++
        continue
      }
      const rideId = await ctx.db.insert("rides", { parkId, ...seed })
      const initial = RideController.initial(seed, Math.random)
      await ctx.db.insert("rideStates", { parkId, rideId, ...initial, updatedAt: Date.now() })
      created++
    }
    return { parkId, created, updated }
  },
})
