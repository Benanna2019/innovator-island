import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter"
import { components } from "../_generated/api"

const DAY = 24 * HOUR

/**
 * Upstream's `getUploadURL` Lambda was open to anyone. Here uploads need a login, and we throttle per user (a burst
 * of 3, then one every 30 seconds), across all users (20 a minute, 300 a day, because each photo runs a three step
 * workflow) and per user again by pending photos (see `MAX_PENDING_PHOTOS`).
 *
 * The admin buckets are defence in depth: on a demo deployment anyone can reach the demo admin, so the admin
 * writes and the heavy reset are throttled for everyone together.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  photoUpload: { kind: "token bucket", rate: 2, period: MINUTE, capacity: 3 },
  photoUploadGlobal: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 20 },
  photoUploadDaily: { kind: "token bucket", rate: 300, period: DAY, capacity: 300 },
  adminWrite: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 30 },
  adminReset: { kind: "token bucket", rate: 1, period: 5 * MINUTE, capacity: 1 },
})

/** Photos a user may have in flight (uploaded or processing) at once. */
export const MAX_PENDING_PHOTOS = 3
