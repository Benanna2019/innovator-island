import type { Rng } from './rng.ts'

/**
 * Outage reasons.
 *
 * Upstream (aws-samples/aws-serverless-workshop-innovator-island, MIT-0) kept a per-ride reason table and an
 * in-memory cache of recent alerts in a warm Lambda. We keep the reasons. Upstream's 180 second alert throttle has no port: a ride cannot close twice
 * without reopening, so the open `outages` row already drops a repeat delivery.
 */
export class Outages {
  static readonly REASONS = [
    'Routine safety inspection',
    'A guest left something on the track',
    'Software update on the ride computer',
    'Lightning in the area',
    'Waiting on a replacement part',
    'Crew shortage at the loading platform',
  ] as const

  static pickReason(rng: Rng): string {
    return Outages.REASONS[Math.floor(rng() * Outages.REASONS.length)] ?? Outages.REASONS[0]
  }
}
