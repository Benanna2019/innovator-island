import { retrieveAccount } from "@convex-dev/auth/server"
import type { GenericId } from "convex/values"
import { DemoAccounts } from "../../src/domain/demo-accounts.ts"

type ActionCtx = Parameters<typeof retrieveAccount>[0]

/** Looks an account up by email. Injected so the checks below can be tested without the auth component. */
export type AccountLookup = (email: string) => Promise<GenericId<"users">>

export const lookupInCtx =
  (ctx: ActionCtx): AccountLookup =>
  async (email) => {
    const { user } = await retrieveAccount(ctx, { provider: "password", account: { id: email } })
    return user._id as GenericId<"users">
  }

/**
 * Passwordless sign-in as one of the seeded demo accounts. It refuses unless demo mode is on, and `who` must be in
 * the allow-list, so a client can never pick another user or an arbitrary email.
 */
export async function authorizeDemo(
  lookup: AccountLookup,
  demoMode: boolean,
  who: unknown,
): Promise<{ userId: GenericId<"users"> }> {
  const account = DemoAccounts.resolve(demoMode, who)
  return { userId: await lookup(account.email) }
}
