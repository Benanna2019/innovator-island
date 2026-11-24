import type { Rng } from './rng'

export const MAX_VISITORS = 300

export interface OpenRide<Id extends string = string> {
  id: Id
  wait: number
}

/**
 * Pure visitor decisions: state plus an RNG in, a choice out. The scaled-down version of upstream's park simulator
 * (up to 30k visitors, Entry, Ride and Exit events). Phase 2 swaps these for agent policies behind the same shape.
 */
export class Simulator {
  /** How many guests walk in this tick. Zero when the park is full. */
  static arrivals(headcount: number, rng: Rng): number {
    const room = Math.max(0, MAX_VISITORS - headcount)
    return Math.min(room, Math.floor(rng() * 16))
  }

  static wantsToExit(rng: Rng): boolean {
    return rng() < 0.08
  }

  static wantsToRide(rng: Rng): boolean {
    return rng() < 0.25
  }

  /** Picks among open rides, weighted toward shorter waits. Null when nothing is open. */
  static chooseRide<Id extends string>(rides: readonly OpenRide<Id>[], rng: Rng): OpenRide<Id> | null {
    if (rides.length === 0) return null
    const weights = rides.map((r) => 1 / (10 + r.wait))
    let roll = rng() * weights.reduce((a, b) => a + b, 0)
    for (let i = 0; i < rides.length; i++) {
      roll -= weights[i]
      if (roll <= 0) return rides[i]
    }
    return rides[rides.length - 1]
  }

  /** A 1 to 5 rating. Long waits pull it down. */
  static rate(wait: number, rng: Rng): number {
    const score = 4.6 - wait / 40 + (rng() - 0.5) * 2
    return Math.min(5, Math.max(1, Math.round(score)))
  }
}
