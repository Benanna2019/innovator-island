import type { Infer } from "convex/values"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { internal } from "../_generated/api"
import type { parkEventPayload } from "../schema"
import { isStatsEvent, parkStats } from "./parkStats"

export type ParkEventPayload = Infer<typeof parkEventPayload>
export type ParkEventType = ParkEventPayload["type"]
export type ParkEventOf<T extends ParkEventType> = Extract<ParkEventPayload, { type: T }>

/**
 * Event types that have a subscriber in `convex/subscribers.ts`. `publish` only schedules `events.dispatch` for these,
 * so a high-volume event nobody handles (RideWaitChanged, about 23k a day) costs no function call. `subscribers.ts`
 * is only imported by `events.ts`, so `publish` cannot read the registry. A test keeps this list and the registry equal.
 */
export const DISPATCHED_TYPES: ReadonlySet<ParkEventType> = new Set<ParkEventType>(["RideClosed", "RideReopened"])

export type Subscriber<T extends ParkEventType = ParkEventType> = {
  /** Stable name. Stored on the event row so a handler never runs twice for the same event. */
  name: string
  type: T
  handle: (ctx: MutationCtx, event: Doc<"parkEvents"> & { payload: ParkEventOf<T> }) => Promise<void>
}

/**
 * The event bus: `parkEvents` is the log, `publish` appends to it, and subscribers run in their own mutation
 * scheduled right after. This replaces EventBridge rules and the SNS topic in the AWS original.
 * `convex/subscribers.ts` registers the subscribers; `convex/events.ts` runs them.
 */
export class EventBus {
  private static readonly registry = new Map<ParkEventType, Subscriber<ParkEventType>[]>()

  static subscribe<T extends ParkEventType>(subscriber: Subscriber<T>): void {
    const list = EventBus.registry.get(subscriber.type) ?? []
    if (list.some((s) => s.name === subscriber.name)) return
    list.push(subscriber as unknown as Subscriber<ParkEventType>)
    EventBus.registry.set(subscriber.type, list)
  }

  static subscribersFor(type: ParkEventType): readonly Subscriber<ParkEventType>[] {
    return EventBus.registry.get(type) ?? []
  }

  /**
   * Appends the event and schedules its subscribers. Safe to call from any mutation, and rolls back with it.
   * Subscribers are only scheduled for types in DISPATCHED_TYPES. Pass `dispatch` to override that, and `at` to backdate an event when seeding history.
   */
  static async publish(
    ctx: MutationCtx,
    parkId: Id<"parks">,
    payload: ParkEventPayload,
    options: { dispatch?: boolean; at?: number } = {},
  ): Promise<Id<"parkEvents">> {
    const eventId = await ctx.db.insert("parkEvents", { parkId, at: options.at ?? Date.now(), payload })
    if (isStatsEvent(payload.type)) {
      const doc = await ctx.db.get(eventId)
      if (doc) await parkStats.insert(ctx, doc)
    }
    if (options.dispatch ?? DISPATCHED_TYPES.has(payload.type)) await ctx.scheduler.runAfter(0, internal.events.dispatch, { eventId })
    return eventId
  }

  /** Runs every subscriber that has not yet handled the event. Idempotent. */
  static async dispatch(ctx: MutationCtx, eventId: Id<"parkEvents">): Promise<void> {
    const first = await ctx.db.get(eventId)
    if (!first) return
    let handledBy = first.handledBy ?? []
    for (const subscriber of EventBus.subscribersFor(first.payload.type)) {
      if (handledBy.includes(subscriber.name)) continue
      await subscriber.handle(ctx, { ...first, payload: first.payload })
      handledBy = [...handledBy, subscriber.name]
      await ctx.db.patch(eventId, { handledBy })
    }
  }
}
