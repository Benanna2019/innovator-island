import { getAuthUserId } from "@convex-dev/auth/server"
import { query } from "./_generated/server"
import { flags } from "./lib/config"
import { roleOf } from "./lib/auth"

/** The signed-in user for the header, or null. Only the fields the UI shows. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    const user = userId ? await ctx.db.get(userId) : null
    if (!user) return null
    return { id: user._id, name: user.name ?? user.email ?? "Guest", email: user.email ?? null, role: roleOf(user) }
  },
})

/** Public config the sign-in page needs: whether the demo buttons show and whether sign-up is open. */
export const publicConfig = query({
  args: {},
  handler: async () => {
    const { demoMode } = flags()
    return { demoMode, signUpOpen: !demoMode }
  },
})
