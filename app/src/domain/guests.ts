import { type Rng, Rngs } from './rng.ts'

export type GuestLanguage = 'en' | 'fr' | 'es' | 'ja'
export type GuestStatus = 'walking' | 'queuing' | 'riding' | 'dining' | 'left'

export const GUEST_LANGUAGES: readonly GuestLanguage[] = ['en', 'fr', 'es', 'ja']
export const GUEST_COUNT = 300

const NAMES: Record<GuestLanguage, { given: readonly string[]; family: readonly string[] }> = {
  en: {
    given: ['Avery', 'Jordan', 'Riley', 'Morgan', 'Casey', 'Taylor', 'Quinn', 'Harper', 'Rowan', 'Emerson', 'Drew', 'Parker', 'Skyler', 'Logan', 'Hayden', 'Marlowe', 'Dana', 'Elliot', 'Reese', 'Sidney'],
    family: ['Brooks', 'Carter', 'Foster', 'Hughes', 'Reed', 'Sutton', 'Whitaker', 'Lindqvist', 'Prescott', 'Okafor', 'Delaney', 'Hartley', 'Nolan', 'Ashford', 'Calloway'],
  },
  fr: {
    given: ['Camille', 'Louis', 'Léa', 'Hugo', 'Manon', 'Jules', 'Chloé', 'Théo', 'Inès', 'Lucas', 'Élodie', 'Mathis', 'Zoé', 'Gabriel', 'Margaux', 'Arthur'],
    family: ['Dubois', 'Lefèvre', 'Moreau', 'Laurent', 'Fontaine', 'Girard', 'Roussel', 'Bonnet', 'Mercier', 'Lambert', 'Chevalier', 'Perrin'],
  },
  es: {
    given: ['Sofía', 'Mateo', 'Valentina', 'Diego', 'Lucía', 'Carlos', 'Isabel', 'Javier', 'Camila', 'Andrés', 'Marisol', 'Rafael', 'Daniela', 'Tomás', 'Paula', 'Nicolás'],
    family: ['García', 'Hernández', 'López', 'Martínez', 'Rojas', 'Vargas', 'Navarro', 'Castillo', 'Ortega', 'Delgado', 'Herrera', 'Medina'],
  },
  ja: {
    given: ['結衣', '蓮', '陽菜', '湊', '美咲', '大輝', '葵', '颯太', '莉子', '健太', '花', '翔', '凛', '悠真', '彩', '陸'],
    family: ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山口'],
  },
}

export interface GuestProfile {
  slug: string
  name: string
  language: GuestLanguage
  avatarHue: number
  initials: string
  /** Days since the guest joined, 0 to 3. */
  joinedDaysAgo: number
}

const first = (text: string) => Array.from(text)[0] ?? ''

/** Deterministic: the same index always gives the same guest, so seeding twice finds the same people. */
export class GuestFactory {
  static slug(index: number): string {
    return `guest-${String(index + 1).padStart(4, '0')}`
  }

  static language(rng: Rng): GuestLanguage {
    const roll = rng()
    return roll < 0.42 ? 'en' : roll < 0.57 ? 'fr' : roll < 0.8 ? 'es' : 'ja'
  }

  static profile(index: number): GuestProfile {
    const rng = Rngs.seeded(0x9e3779b1 + index * 7919)
    const language = GuestFactory.language(rng)
    const pool = NAMES[language]
    const given = pool.given[Rngs.int(rng, 0, pool.given.length - 1)]
    const family = pool.family[Rngs.int(rng, 0, pool.family.length - 1)]
    const japanese = language === 'ja'
    return {
      slug: GuestFactory.slug(index),
      name: japanese ? `${family} ${given}` : `${given} ${family}`,
      language,
      avatarHue: Rngs.int(rng, 0, 359),
      initials: japanese ? first(family) : `${first(given)}${first(family)}`.toUpperCase(),
      joinedDaysAgo: Rngs.int(rng, 0, 3),
    }
  }
}

/** A place on the map a guest can be heading to or standing at: a ride id or a facility id. */
export interface Spot {
  id: string
}

export interface GuestState {
  status: GuestStatus
  rideId?: string
  facilityId?: string
  walkFrom?: string
  walkTo?: string
}

export interface GuestWorld {
  /** Rides that are open, with their current wait in minutes. */
  openRides: readonly { id: string; wait: number }[]
  /** Every ride id, open or not, for walking targets. */
  rideIds: readonly string[]
  diningIds: readonly string[]
}

export type GuestEffect = 'none' | 'rode' | 'left' | 'entered'

export interface GuestMove {
  state: GuestState
  effect: GuestEffect
}

/**
 * Pure guest decisions: state plus an RNG in, the next state out. Phase 2 swaps these for agent policies behind the
 * same shape. `step` returns null when the guest stays where they are, so the caller writes nothing.
 */
export class GuestSim {
  /** Picks a ride, weighted toward favorites and shorter waits. Null when nothing is open. */
  static chooseRide(openRides: GuestWorld['openRides'], favorites: readonly string[], rng: Rng): string | null {
    if (openRides.length === 0) return null
    const weights = openRides.map((r) => (favorites.includes(r.id) ? 3 : 1) / (10 + r.wait))
    let roll = rng() * weights.reduce((a, b) => a + b, 0)
    for (let i = 0; i < openRides.length; i++) {
      roll -= weights[i]
      if (roll <= 0) return openRides[i].id
    }
    return openRides[openRides.length - 1].id
  }

  private static pick<T>(items: readonly T[], rng: Rng): T | undefined {
    return items[Math.floor(rng() * items.length)]
  }

  static step(guest: GuestState & { favoriteRideIds: readonly string[] }, world: GuestWorld, rng: Rng): GuestMove | null {
    const here = guest.rideId ?? guest.facilityId ?? guest.walkTo
    switch (guest.status) {
      case 'walking': {
        const roll = rng()
        if (roll < 0.6) {
          const rideId = GuestSim.chooseRide(world.openRides, guest.favoriteRideIds, rng)
          if (rideId) return { state: { status: 'queuing', rideId }, effect: 'none' }
        }
        if (roll < 0.85) {
          const facilityId = GuestSim.pick(world.diningIds, rng)
          if (facilityId) return { state: { status: 'dining', facilityId }, effect: 'none' }
        }
        return roll > 0.9 ? { state: { status: 'left' }, effect: 'left' } : null
      }
      case 'queuing': {
        const open = world.openRides.some((r) => r.id === guest.rideId)
        // A closed ride sends the line away to find something else.
        if (!open) return { state: { status: 'walking', walkFrom: here, walkTo: GuestSim.pick(world.rideIds, rng) }, effect: 'none' }
        return { state: { status: 'riding', rideId: guest.rideId }, effect: 'none' }
      }
      case 'riding':
        return { state: { status: 'walking', walkFrom: here, walkTo: GuestSim.pick(world.rideIds, rng) }, effect: 'rode' }
      case 'dining':
        return { state: { status: 'walking', walkFrom: here, walkTo: GuestSim.pick(world.rideIds, rng) }, effect: 'none' }
      case 'left':
        return rng() < 0.4 ? { state: { status: 'walking', walkTo: GuestSim.pick(world.rideIds, rng) }, effect: 'entered' } : null
    }
  }

  /** The starting mix for a freshly seeded park. */
  static initial(world: GuestWorld, favorites: readonly string[], rng: Rng): GuestState {
    const roll = rng()
    if (roll < 0.15) return { status: 'left' }
    if (roll < 0.5) return { status: 'walking', walkFrom: GuestSim.pick(world.rideIds, rng), walkTo: GuestSim.pick(world.rideIds, rng) }
    if (roll < 0.62) {
      const facilityId = GuestSim.pick(world.diningIds, rng)
      if (facilityId) return { status: 'dining', facilityId }
    }
    const rideId = GuestSim.chooseRide(world.openRides, favorites, rng)
    if (!rideId) return { status: 'walking', walkTo: GuestSim.pick(world.rideIds, rng) }
    return { status: roll < 0.9 ? 'queuing' : 'riding', rideId }
  }

  /** How many in line a ride shows on the map: counts only, from a list of states. */
  static queueSizes(guests: readonly { status: GuestStatus; rideId?: string }[]): Map<string, number> {
    const sizes = new Map<string, number>()
    for (const g of guests) if (g.status === 'queuing' && g.rideId) sizes.set(g.rideId, (sizes.get(g.rideId) ?? 0) + 1)
    return sizes
  }
}
