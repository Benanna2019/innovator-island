import { getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError } from "convex/values"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

type Ctx = QueryCtx | MutationCtx

/** The signed-in user, or a typed error the client can show. */
export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx)
  const user = userId ? await ctx.db.get(userId) : null
  if (!user) throw new ConvexError({ code: "Unauthenticated" })
  return user
}

export const roleOf = (user: Doc<"users">): "admin" | "guest" => user.role ?? "guest"

/** Every admin mutation and query starts here: the role is read from the database, never from the client. */
export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx)
  if (roleOf(user) !== "admin") throw new ConvexError({ code: "Forbidden" })
  return user
}

export type UserId = Id<"users">
