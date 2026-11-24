import { TableAggregate } from "@convex-dev/aggregate"
import { components } from "../_generated/api"
import type { DataModel, Id } from "../_generated/dataModel"

/**
 * Counts and sums over visitor events, keyed by [event type, time]. Replaces Firehose, S3, Athena and QuickSight:
 * headcount, rides per hour and average rating are all range queries over this one tree.
 */
export const parkStats = new TableAggregate<{
  Namespace: Id<"parks">
  Key: [string, number]
  DataModel: DataModel
  TableName: "parkEvents"
}>(components.parkStats, {
  namespace: (doc) => doc.parkId,
  sortKey: (doc) => [doc.payload.type, doc.at],
  sumValue: (doc) => (doc.payload.type === "VisitorRode" ? doc.payload.rating : 0),
})

export const STATS_EVENT_TYPES = ["VisitorEntered", "VisitorRode", "VisitorExited"] as const
export const isStatsEvent = (type: string) => (STATS_EVENT_TYPES as readonly string[]).includes(type)
