import { start, vResultValidator, vWorkflowId } from "@convex-dev/workflow"
import { ConvexError, v } from "convex/values"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalMutation, internalQuery, mutation, query } from "./_generated/server"
import type { QueryCtx } from "./_generated/server"
import { requireUser } from "./lib/auth"
import { MAX_PENDING_PHOTOS, rateLimiter } from "./lib/limits"
import { PhotoValidation } from "../src/domain/photo-validation.ts"
import { getAuthUserId } from "@convex-dev/auth/server"

/** Photos of this user that have not finished yet. Looks at the newest few only: older ones are long done or failed. */
async function pendingCount(ctx: QueryCtx, userId: Id<"users">): Promise<number> {
  const recent = await ctx.db.query("photos").withIndex("by_user", (q) => q.eq("userId", userId)).order("desc").take(MAX_PENDING_PHOTOS * 2)
  return recent.filter((p) => p.status === "uploaded" || p.status === "processing").length
}

/** Upstream `getUploadURL`: a presigned S3 PUT. Here it is file storage, for signed-in users only, throttled per user and across all users. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    if ((await pendingCount(ctx, user._id)) >= MAX_PENDING_PHOTOS) throw new ConvexError({ kind: "RateLimited", retryAfter: 30_000 })
    await rateLimiter.limit(ctx, "photoUpload", { key: user._id, throws: true })
    await rateLimiter.limit(ctx, "photoUploadGlobal", { throws: true })
    await rateLimiter.limit(ctx, "photoUploadDaily", { throws: true })
    return await ctx.storage.generateUploadUrl()
  },
})

/**
 * Called after the browser has PUT the file. Validates what was really stored, then starts the workflow.
 * A rejected file comes back as a result, not a throw: a throw would roll back the delete and orphan the blob.
 */
export const submit = mutation({
  args: { parkSlug: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    // A double click or a retry gets the photo that is already running, not a second row and workflow.
    const existing = await ctx.db.query("photos").withIndex("by_original", (q) => q.eq("originalId", args.storageId)).first()
    if (existing) {
      if (existing.userId !== user._id) return { ok: false as const, code: "NotAnImage" as const }
      return { ok: true as const, photoId: existing._id }
    }
    // The id must be a fresh upload. A blob that already belongs to a photo (any stage) would be deleted with that photo's workflow.
    const claimed = await Promise.all([
      ctx.db.query("photos").withIndex("by_keyed", (q) => q.eq("keyedId", args.storageId)).first(),
      ctx.db.query("photos").withIndex("by_composed", (q) => q.eq("composedId", args.storageId)).first(),
      ctx.db.query("photos").withIndex("by_final", (q) => q.eq("finalId", args.storageId)).first(),
    ])
    if (claimed.some(Boolean)) return { ok: false as const, code: "NotAnImage" as const }
    const file = await ctx.db.system.get(args.storageId)
    if (!file) return { ok: false as const, code: "NotAnImage" as const }
    const problem = PhotoValidation.firstError({ size: file.size, type: file.contentType ?? "" })
    if (problem) {
      await ctx.storage.delete(args.storageId)
      return { ok: false as const, code: problem._tag }
    }
    if ((await pendingCount(ctx, user._id)) >= MAX_PENDING_PHOTOS) {
      await ctx.storage.delete(args.storageId)
      return { ok: false as const, code: "RateLimited" as const }
    }
    const park = await ctx.db.query("parks").withIndex("by_slug", (q) => q.eq("slug", args.parkSlug)).unique()
    if (!park) throw new ConvexError({ code: "NoPark" })
    const photoId = await ctx.db.insert("photos", {
      parkId: park._id,
      userId: user._id,
      status: "uploaded",
      originalId: args.storageId,
      createdAt: Date.now(),
    })
    await start(ctx, internal.photoWorkflow.processPhoto, { photoId }, {
      onComplete: internal.photos.onWorkflowComplete,
      context: { photoId },
    })
    return { ok: true as const, photoId }
  },
})

/** The live gallery of the signed-in user. Upstream pushed "photo ready" to the browser over IoT MQTT. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []
    const photos = await ctx.db.query("photos").withIndex("by_user", (q) => q.eq("userId", userId)).order("desc").take(12)
    return await Promise.all(
      photos.map(async (p) => ({
        id: p._id,
        status: p.status,
        failure: p.failure ?? null,
        createdAt: p.createdAt,
        url: p.finalId ? await ctx.storage.getUrl(p.finalId) : null,
      })),
    )
  },
})

export const get = internalQuery({
  args: { photoId: v.id("photos") },
  handler: async (ctx, { photoId }) => await ctx.db.get(photoId),
})

export const progress = internalMutation({
  args: {
    photoId: v.id("photos"),
    keyedId: v.optional(v.id("_storage")),
    composedId: v.optional(v.id("_storage")),
    finalId: v.optional(v.id("_storage")),
    status: v.optional(v.union(v.literal("processing"), v.literal("ready"))),
  },
  handler: async (ctx, { photoId, status, ...ids }) => {
    await ctx.db.patch(photoId, { ...ids, status: status ?? "processing" })
  },
})

const TAGS = ["UploadTooLarge", "NotAnImage", "ChromaKeyFailed"] as const

export const onWorkflowComplete = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ photoId: v.id("photos") }) },
  handler: async (ctx, { result, context }) => {
    const photo = await ctx.db.get(context.photoId)
    if (!photo) return
    // The selfie and the intermediate blobs are no use once the pipeline has finished, either way.
    for (const id of [photo.originalId, photo.keyedId, photo.composedId]) if (id) await ctx.storage.delete(id)
    const cleared = { originalId: undefined, keyedId: undefined, composedId: undefined }
    if (result.kind === "success") {
      await ctx.db.patch(context.photoId, cleared)
      return
    }
    const message = result.kind === "failed" ? result.error : "canceled"
    const tag = TAGS.find((t) => message.includes(t)) ?? "ChromaKeyFailed"
    await ctx.db.patch(context.photoId, { ...cleared, status: "failed", failure: tag })
  },
})

const ORPHAN_AGE_MS = 60 * 60 * 1000
const SWEEP_BATCH = 100

/**
 * Daily sweep of file storage: deletes blobs older than an hour that no `photos` row points at. These come from
 * uploads that never reached `submit` and from workflow steps that stored a blob and were retried before `progress`.
 * It walks storage oldest first and stops at the first young file, and a full page schedules the next one.
 */
export const sweepOrphans = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }): Promise<number> => {
    const cutoff = Date.now() - ORPHAN_AGE_MS
    const page = await ctx.db.system.query("_storage").order("asc").paginate({ numItems: SWEEP_BATCH, cursor: cursor ?? null })
    let deleted = 0
    for (const file of page.page) {
      if (file._creationTime >= cutoff) return deleted
      const id = file._id
      const refs = await Promise.all([
        ctx.db.query("photos").withIndex("by_original", (q) => q.eq("originalId", id)).first(),
        ctx.db.query("photos").withIndex("by_keyed", (q) => q.eq("keyedId", id)).first(),
        ctx.db.query("photos").withIndex("by_composed", (q) => q.eq("composedId", id)).first(),
        ctx.db.query("photos").withIndex("by_final", (q) => q.eq("finalId", id)).first(),
      ])
      if (refs.some(Boolean)) continue
      await ctx.storage.delete(id)
      deleted++
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.photos.sweepOrphans, { cursor: page.continueCursor })
    return deleted
  },
})
