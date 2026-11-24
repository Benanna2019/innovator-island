import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter"
import { components } from "../_generated/api"

/**
 * Upstream's `getUploadURL` Lambda was open to anyone. We throttle per guest (a burst of 3, then one every 30
 * seconds) and across all guests, because a guest id is client-chosen and a fresh one gets a fresh bucket.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  photoUpload: { kind: "token bucket", rate: 2, period: MINUTE, capacity: 3 },
  photoUploadGlobal: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 60 },
})
