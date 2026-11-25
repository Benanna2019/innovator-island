/** The demo admin. It has a password only: it is not in the passwordless list below, and `demo:ensureAccounts` sets that password. */
export const DEMO_ADMIN = { email: "demo-admin@innovator-island.demo", name: "Demo Admin", role: "admin" } as const

/**
 * The only accounts the passwordless "demo" sign-in can reach, all guests. `who` comes from the browser, so it is
 * checked against this list and never used as an email.
 */
export const DEMO_GUESTS = {
  "guest-1": { email: "demo-guest1@innovator-island.demo", name: "Demo Guest One", role: "guest" },
  "guest-2": { email: "demo-guest2@innovator-island.demo", name: "Demo Guest Two", role: "guest" },
  "guest-3": { email: "demo-guest3@innovator-island.demo", name: "Demo Guest Three", role: "guest" },
} as const

/** Every seeded demo account, admin included. Only `DEMO_GUESTS` can sign in without a password. */
export const DEMO_ACCOUNTS = { admin: DEMO_ADMIN, ...DEMO_GUESTS } as const

export type DemoWho = keyof typeof DEMO_GUESTS

export class DemoAccounts {
  static isWho(value: unknown): value is DemoWho {
    return typeof value === "string" && Object.hasOwn(DEMO_GUESTS, value)
  }

  /**
   * Resolves a demo sign-in request to a fixed account email. Throws unless demo mode is on and `who` is in the
   * allow-list, which has no admin.
   */
  static resolve(demoMode: boolean, who: unknown): (typeof DEMO_GUESTS)[DemoWho] {
    if (!demoMode) throw new Error("Demo sign-in is turned off.")
    if (!DemoAccounts.isWho(who)) throw new Error("Unknown demo account.")
    return DEMO_GUESTS[who]
  }
}
