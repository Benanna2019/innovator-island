import { type Rng, Rngs } from './rng.ts'

/** Static ride config. Mirrors the `rides` table fields the controller needs. */
export interface RideConfig {
  minWait: number
  maxWait: number
  /** Most the wait can move in one tick, in minutes. */
  waitChangeRate: number
  /** Chance per tick that an open ride closes. */
  closureProbability: number
}

export interface RideSnapshot {
  wait: number
  targetWait: number
  closed: boolean
}

export type RideTransition = 'none' | 'wait-changed' | 'closed' | 'reopened'

export interface RideStep extends RideSnapshot {
  transition: RideTransition
}

/**
 * The ride controller. `step` is a pure function of config, current state and a random source, so a phase 2
 * agent policy can replace it behind the same signature.
 *
 * Ported from the "FATcontroller" `updateRideState` in aws-samples/aws-serverless-workshop-innovator-island
 * (MIT-0): a wait time drifts toward a random target by at most `waitChangeRate` per tick, and a ride can close at random.
 */
export class RideController {
  /** Chance per tick that a closed ride reopens. The upstream code reopened on a fixed schedule. */
  static readonly REOPEN_PROBABILITY = 0.25

  static pickTarget(ride: RideConfig, rng: Rng): number {
    return Rngs.int(rng, ride.minWait, ride.maxWait)
  }

  static initial(ride: RideConfig, rng: Rng): RideSnapshot {
    return { wait: RideController.pickTarget(ride, rng), targetWait: RideController.pickTarget(ride, rng), closed: false }
  }

  static step(ride: RideConfig, state: RideSnapshot, rng: Rng): RideStep {
    if (state.closed) {
      if (rng() >= RideController.REOPEN_PROBABILITY) return { ...state, wait: 0, transition: 'none' }
      return {
        wait: ride.minWait,
        targetWait: RideController.pickTarget(ride, rng),
        closed: false,
        transition: 'reopened',
      }
    }

    if (rng() < ride.closureProbability) {
      return { wait: 0, targetWait: state.targetWait, closed: true, transition: 'closed' }
    }

    const gap = state.targetWait - state.wait
    const move = Math.max(-ride.waitChangeRate, Math.min(ride.waitChangeRate, gap))
    const wait = Math.max(ride.minWait, Math.min(ride.maxWait, state.wait + move))
    // Reached the target (or close enough to be there next tick): choose a new one.
    const targetWait = wait === state.targetWait ? RideController.pickTarget(ride, rng) : state.targetWait
    return { wait, targetWait, closed: false, transition: wait === state.wait ? 'none' : 'wait-changed' }
  }
}
