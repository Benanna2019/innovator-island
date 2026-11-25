/** Deployment flags, read from Convex env vars. Demo mode must be off for real use. */
export const flags = () => ({ demoMode: process.env.DEMO_MODE === "true" })
