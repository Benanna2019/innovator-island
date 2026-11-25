import { createAccount, modifyAccountCredentials, retrieveAccount } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import { internalAction, internalMutation } from "./_generated/server"
import { flags } from "./lib/config"
import { DEMO_ACCOUNTS } from "../src/domain/demo-accounts.ts"

/** Sets the role on a demo user. The password provider's own profile never carries a role. */
export const setRole = internalMutation({
  args: { email: v.string(), role: v.union(v.literal("admin"), v.literal("guest")), name: v.string() },
  handler: async (ctx, { email, role, name }) => {
    const user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).unique()
    if (!user) throw new Error("No such demo user.")
    await ctx.db.patch(user._id, { role, name })
  },
})

/**
 * Creates or updates the four demo password accounts from Convex env vars. Refuses unless DEMO_MODE is "true" and
 * both DEMO_ADMIN_PASSWORD and DEMO_GUEST_PASSWORD are set. Passwords are never logged or returned.
 * `npx convex run demo:ensureAccounts`
 */
export const ensureAccounts = internalAction({
  args: {},
  handler: async (ctx): Promise<{ created: string[]; updated: string[] }> => {
    if (!flags().demoMode) throw new Error("demo:ensureAccounts only runs when DEMO_MODE is true.")
    const adminPassword = process.env.DEMO_ADMIN_PASSWORD
    const guestPassword = process.env.DEMO_GUEST_PASSWORD
    if (!adminPassword || !guestPassword) throw new Error("Set DEMO_ADMIN_PASSWORD and DEMO_GUEST_PASSWORD first.")
    if (adminPassword.length < 8 || guestPassword.length < 8) throw new Error("Demo passwords need at least 8 characters.")

    const created: string[] = []
    const updated: string[] = []
    for (const account of Object.values(DEMO_ACCOUNTS)) {
      const secret = account.role === "admin" ? adminPassword : guestPassword
      const exists = await retrieveAccount(ctx, { provider: "password", account: { id: account.email } }).then(
        () => true,
        () => false,
      )
      if (exists) {
        await modifyAccountCredentials(ctx, { provider: "password", account: { id: account.email, secret } })
        updated.push(account.email)
      } else {
        await createAccount(ctx, {
          provider: "password",
          account: { id: account.email, secret },
          profile: { email: account.email, name: account.name },
          shouldLinkViaEmail: false,
          shouldLinkViaPhone: false,
        })
        created.push(account.email)
      }
      await ctx.runMutation(internal.demo.setRole, { email: account.email, role: account.role, name: account.name })
    }
    return { created, updated }
  },
})
