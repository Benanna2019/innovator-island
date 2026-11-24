"use node"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalAction } from "./_generated/server"
import { runStep } from "./lib/runStep"
import { ImagePipeline } from "../src/domain/image/pipeline.ts"

/**
 * The three pipeline steps as Node actions. Each reads a blob from file storage, runs a pure-JS image step and
 * stores the result. They replace the three S3-triggered Lambdas (OpenCV chroma key, Jimp composite, post-process).
 */
export const chromaKey = internalAction({
  args: { photoId: v.id("photos") },
  handler: async (ctx, { photoId }): Promise<Id<"_storage">> => {
    const photo = await ctx.runQuery(internal.photos.get, { photoId })
    const original = photo?.originalId ? await ctx.storage.get(photo.originalId) : null
    if (!original) throw new Error("NotAnImage: the uploaded file is gone")
    const png = await runStep(ImagePipeline.chromaKey(new Uint8Array(await original.arrayBuffer())))
    const keyedId = await ctx.storage.store(new Blob([new Uint8Array(png)], { type: "image/png" }))
    await ctx.runMutation(internal.photos.progress, { photoId, keyedId })
    return keyedId
  },
})

export const composite = internalAction({
  args: { photoId: v.id("photos"), keyedId: v.id("_storage") },
  handler: async (ctx, { photoId, keyedId }): Promise<Id<"_storage">> => {
    const keyed = await ctx.storage.get(keyedId)
    if (!keyed) throw new Error("ChromaKeyFailed: the keyed image is gone")
    const png = await runStep(ImagePipeline.composite(new Uint8Array(await keyed.arrayBuffer())))
    const composedId = await ctx.storage.store(new Blob([new Uint8Array(png)], { type: "image/png" }))
    await ctx.runMutation(internal.photos.progress, { photoId, composedId })
    return composedId
  },
})

export const finalize = internalAction({
  args: { photoId: v.id("photos"), composedId: v.id("_storage") },
  handler: async (ctx, { photoId, composedId }): Promise<void> => {
    const composed = await ctx.storage.get(composedId)
    if (!composed) throw new Error("ChromaKeyFailed: the composite is gone")
    const jpeg = await runStep(ImagePipeline.finalize(new Uint8Array(await composed.arrayBuffer())))
    const finalId = await ctx.storage.store(new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }))
    await ctx.runMutation(internal.photos.progress, { photoId, finalId, status: "ready" })
  },
})
