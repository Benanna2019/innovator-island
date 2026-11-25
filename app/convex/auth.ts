import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials"
import { Password } from "@convex-dev/auth/providers/Password"
import { convexAuth } from "@convex-dev/auth/server"
import { ConvexError } from "convex/values"
import { flags } from "./lib/config"
import { authorizeDemo, lookupInCtx } from "./lib/demoAuth"

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Password({
      profile(params) {
        // Open sign-up would let anyone mint accounts on a public demo, so demo mode closes it. The demo accounts
        // are made by `demo:ensureAccounts` instead. New users get no role here, which means "guest".
        if (params.flow === "signUp" && flags().demoMode) throw new ConvexError({ code: "SignUpClosed" })
        return {
          email: String(params.email ?? "").trim().toLowerCase(),
          ...(params.name ? { name: String(params.name).slice(0, 80) } : {}),
        }
      },
    }),
    // Only works while DEMO_MODE is "true", and only ever signs in a seeded demo account chosen from an allow-list.
    ConvexCredentials({
      id: "demo",
      authorize: (credentials, ctx) => authorizeDemo(lookupInCtx(ctx), flags().demoMode, credentials.who),
    }),
  ],
})
