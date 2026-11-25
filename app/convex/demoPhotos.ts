"use node"
import { Jimp } from "jimp"
import { internal } from "./_generated/api"
import { internalAction } from "./_generated/server"
import { DEMO_ACCOUNTS } from "../src/domain/demo-accounts.ts"
import { TicketStub } from "../src/domain/image/ticket-stub.ts"

const PHOTOS_PER_GUEST = 4

/**
 * Gives each demo guest account a few finished ride photos, so the gallery is not empty on a demo. The pictures are
 * generated ticket-stub placeholders (see `TicketStub`), stored in Convex storage and linked as ready photos.
 * Skips an account that already has its photos, so it is safe to run again.
 */
export const seedAll = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    let added = 0
    for (const account of Object.values(DEMO_ACCOUNTS)) {
      if (account.role !== "guest") continue
      const userId = await ctx.runQuery(internal.demoData.userByEmail, { email: account.email })
      if (!userId) return "skipped: run demo:ensureAccounts first"
      const have = await ctx.runQuery(internal.demoData.photoCount, { userId })
      for (let i = have; i < PHOTOS_PER_GUEST; i++) {
        const bitmap = TicketStub.draw(Math.abs(hash(`${account.email}-${i}`)))
        const image = Jimp.fromBitmap({ data: Buffer.from(bitmap.data), width: bitmap.width, height: bitmap.height })
        const png = await image.getBuffer("image/png")
        const finalId = await ctx.storage.store(new Blob([new Uint8Array(png)], { type: "image/png" }))
        await ctx.runMutation(internal.demoData.addReadyPhoto, { userId, finalId, hoursAgo: 2 + i * 7 })
        added++
      }
    }
    return `added ${added}`
  },
})

function hash(text: string): number {
  let h = 2166136261
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}
