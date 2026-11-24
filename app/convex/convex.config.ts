import { defineApp } from "convex/server"
import aggregate from "@convex-dev/aggregate/convex.config.js"
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js"
import workflow from "@convex-dev/workflow/convex.config.js"

const app = defineApp()
// Photo pipeline: durable steps in place of the S3-triggered Lambda chain.
app.use(workflow)
// Upload throttling in place of API Gateway usage plans.
app.use(rateLimiter)
// Park stats: counts and sums over parkEvents in place of Firehose, Athena and QuickSight.
app.use(aggregate, { name: "parkStats" })

export default app
