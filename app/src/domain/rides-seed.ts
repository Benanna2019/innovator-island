/**
 * The 16 rides. Same shape as upstream's initRideState.json (min and max wait, change rate, closure probability),
 * with our own names. x and y are percentages of the map image, converted from the original Leaflet coordinates
 * (x = lng / 2625, y = (4500 - lat) / 4500). Each ride sits where the original ride with the same icon sat.
 * `legacySlugs` lets the seed rename rides that an earlier seed already created.
 */
export interface RideSeed {
  slug: string
  legacySlugs: readonly string[]
  name: string
  icon: string
  minWait: number
  maxWait: number
  waitChangeRate: number
  closureProbability: number
  x: number
  y: number
}

export const PARK_SEED = { slug: 'innovator-island', name: 'Innovator Island' } as const

export const RIDE_SEEDS: readonly RideSeed[] = [
  { slug: 'throttle-4d-dome', legacySlugs: ['throttle-twister'], name: 'Throttle 4D Dome', icon: '4d-dome', minWait: 20, maxWait: 100, waitChangeRate: 9, closureProbability: 0.025, x: 73.8, y: 29.3 },
  { slug: 'cold-start-coaster', legacySlugs: [], name: 'Cold Start Coaster', icon: 'coaster-loop', minWait: 20, maxWait: 90, waitChangeRate: 8, closureProbability: 0.02, x: 26.7, y: 37.3 },
  { slug: 'event-horizon-rocket', legacySlugs: ['event-horizon-drop'], name: 'Event Horizon Rocket', icon: 'rocket', minWait: 30, maxWait: 110, waitChangeRate: 10, closureProbability: 0.03, x: 71.8, y: 40.6 },
  { slug: 'warm-container-carousel', legacySlugs: [], name: 'Warm Container Carousel', icon: 'carousel', minWait: 5, maxWait: 25, waitChangeRate: 3, closureProbability: 0.005, x: 57.4, y: 75.9 },
  { slug: 'dead-letter-mountain', legacySlugs: ['dead-letter-dungeon'], name: 'Dead Letter Mountain', icon: 'snow-mountain', minWait: 10, maxWait: 50, waitChangeRate: 5, closureProbability: 0.015, x: 32.8, y: 50.9 },
  { slug: 'idempotent-elephant', legacySlugs: ['idempotent-ibex'], name: 'Idempotent Elephant', icon: 'flying-elephant', minWait: 10, maxWait: 45, waitChangeRate: 5, closureProbability: 0.01, x: 52.5, y: 58 },
  { slug: 'small-workflow-boats', legacySlugs: ['workflow-whirl'], name: "It's a Small Workflow", icon: 'small-world-boat', minWait: 15, maxWait: 70, waitChangeRate: 6, closureProbability: 0.02, x: 39.8, y: 26.4 },
  { slug: 'schema-slide', legacySlugs: [], name: 'Schema Slide', icon: 'water-slide', minWait: 5, maxWait: 35, waitChangeRate: 4, closureProbability: 0.01, x: 50.7, y: 40.2 },
  { slug: 'retry-rapids', legacySlugs: [], name: 'Retry Rapids', icon: 'log-flume', minWait: 15, maxWait: 80, waitChangeRate: 7, closureProbability: 0.02, x: 21.1, y: 69.6 },
  { slug: 'queue-runner-cafe', legacySlugs: ['queue-runner'], name: 'Queue Runner Nut Cafe', icon: 'squirrel-dining', minWait: 10, maxWait: 60, waitChangeRate: 6, closureProbability: 0.01, x: 47.8, y: 16.7 },
  { slug: 'fan-out-swan-lake', legacySlugs: ['fan-out-fountain'], name: 'Fan-Out Swan Lake', icon: 'swan-lake', minWait: 0, maxWait: 15, waitChangeRate: 2, closureProbability: 0.004, x: 60, y: 49 },
  { slug: 'reactive-submarine', legacySlugs: ['reactive-river-ride'], name: 'Reactive Submarine', icon: 'submarine', minWait: 10, maxWait: 55, waitChangeRate: 5, closureProbability: 0.01, x: 21.6, y: 57.8 },
  { slug: 'stateless-petting-zoo', legacySlugs: ['stateless-spinner'], name: 'Stateless Petting Zoo', icon: 'petting-zoo', minWait: 5, maxWait: 40, waitChangeRate: 4, closureProbability: 0.01, x: 77.6, y: 55.8 },
  { slug: 'wild-wild-workers', legacySlugs: ['index-lookup-lift'], name: 'Wild Wild Workers', icon: 'wild-west', minWait: 0, maxWait: 20, waitChangeRate: 3, closureProbability: 0.005, x: 46.6, y: 68 },
  { slug: 'cron-fortune-teller', legacySlugs: ['cron-clock-tower'], name: 'Cron Fortune Teller', icon: 'fortune-teller', minWait: 5, maxWait: 30, waitChangeRate: 2, closureProbability: 0.005, x: 75.1, y: 86.1 },
  { slug: 'mutation-dynamite-show', legacySlugs: ['edge-worker-express'], name: 'Mutation Dynamite Show', icon: 'dynamite-show', minWait: 25, maxWait: 95, waitChangeRate: 8, closureProbability: 0.02, x: 43.6, y: 77.9 },
]
