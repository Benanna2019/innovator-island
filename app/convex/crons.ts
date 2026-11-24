import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

crons.interval("park tick", { minutes: 1 }, internal.park.tick, {})
// Cheap on purpose: a few hundred visitors, every three minutes, and it does nothing while the park is paused.
crons.interval("visitor simulator", { minutes: 3 }, internal.simulate.visitorsTick, {})
// Retention and orphan cleanup, once a day.
crons.interval("prune park events", { hours: 24 }, internal.events.prune, {})
crons.interval("sweep orphaned uploads", { hours: 24 }, internal.photos.sweepOrphans, {})

export default crons
