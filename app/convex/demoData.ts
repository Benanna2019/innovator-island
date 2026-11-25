import { v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"
import { PARK_SEED } from "../src/domain/rides-seed.ts"

export const userByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).unique()
    return user?._id ?? null
  },
})

export const photoCount = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => (await ctx.db.query("photos").withIndex("by_user", (q) => q.eq("userId", userId)).take(20)).length,
})

/** A finished photo for a demo user, with no workflow behind it. */
export const addReadyPhoto = internalMutation({
  args: { userId: v.id("users"), finalId: v.id("_storage"), hoursAgo: v.number() },
  handler: async (ctx, { userId, finalId, hoursAgo }) => {
    const park = await ctx.db.query("parks").withIndex("by_slug", (q) => q.eq("slug", PARK_SEED.slug)).unique()
    if (!park) throw new Error("No park. Run seed:run first.")
    return await ctx.db.insert("photos", {
      parkId: park._id,
      userId,
      status: "ready",
      finalId,
      createdAt: Date.now() - hoursAgo * 60 * 60 * 1000,
    })
  },
})
