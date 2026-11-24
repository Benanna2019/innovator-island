import { Effect } from "effect"

/**
 * Runs an Effect and turns a tagged failure into a plain Error whose message starts with the tag, because
 * Convex passes only the message across the workflow boundary. `photos.onWorkflowComplete` reads the tag back.
 */
export async function runStep<A, E extends { _tag: string }>(effect: Effect.Effect<A, E>): Promise<A> {
  const outcome = await Effect.runPromise(
    Effect.match(effect, {
      onFailure: (error) => ({ ok: false as const, error }),
      onSuccess: (value) => ({ ok: true as const, value }),
    }),
  )
  if (outcome.ok) return outcome.value
  const reason = "reason" in outcome.error ? String(outcome.error.reason) : ""
  throw new Error(`${outcome.error._tag}: ${reason}`)
}
