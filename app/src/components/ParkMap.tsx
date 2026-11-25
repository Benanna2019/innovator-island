import { Link } from '@tanstack/react-router'
import type { CSSProperties } from 'react'
import { FACILITIES } from '#/domain/facilities'
import { Avatar } from './Avatar'
import { WaitLabel } from '#/domain/wait-label'
import { useI18n } from './I18nProvider'
import { WaitPill, rideIconSrc } from './WaitPill'

export interface MapRide {
  id: string
  slug: string
  name: string
  x: number
  y: number
  icon: string | null
  wait: number
  closed: boolean
  queue: number
}

export interface Face {
  id: string
  name: string
  initials: string
  hue: number
}

export interface MapGuests {
  queues: Record<string, { count: number; faces: Face[] }>
  walkers: (Face & { from: string | null; to: string | null; since: number })[]
}

/** Where a walking guest stands: a fixed fraction of the way between two spots, from a hash of the guest and the move. */
class WalkPath {
  static point(from: { x: number; y: number } | undefined, to: { x: number; y: number } | undefined, key: string) {
    if (!from || !to) return null
    let h = 0
    for (const ch of key) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0
    const f = 0.2 + ((h % 100) / 100) * 0.6
    return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f }
  }
}

export const MAP_WIDTH = 1400
export const MAP_HEIGHT = 1720

function FoodIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M5 1.5v5M3 1.5v3.5a2 2 0 0 0 4 0V1.5M5 7v7.5M11.5 14.5v-13c-1.6 1-2.5 3-2.5 5.5h2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * The original illustrated map with a marker per ride. Names show on hover or focus; the list beside the map always shows them. Each marker is a real link to the ride page, named like
 * "Cold Start Coaster, 49 minute wait". The image is decorative: everything on it is also in the ride list.
 */
export function ParkMap({ rides, guests }: { rides: readonly MapRide[]; guests: MapGuests | null }) {
  const { t } = useI18n()
  const spots = new Map<string, { x: number; y: number }>([...rides.map((r) => [r.id, r] as const), ...FACILITIES.map((f) => [f.id, f] as const)])
  return (
    <div className="map">
      <img className="map__art" src="/park/park-map.webp" width={MAP_WIDTH} height={MAP_HEIGHT} alt="" fetchPriority="high" />
      <ul className="map__facilities" aria-label={t('home.facilities')}>
        {FACILITIES.map((f) => {
          const label = f.name ?? t(`facility.${f.kind}`)
          return (
            <li key={f.id} className={`facility facility--${f.kind}`} style={{ left: `${f.x}%`, top: `${f.y}%` }}>
              <span className="facility__glyph" role="img" aria-label={label}>
                {f.kind === 'restroom' ? 'WC' : f.kind === 'atm' ? '$' : <FoodIcon />}
              </span>
            </li>
          )
        })}
      </ul>
      {/* Walking guests are decoration: the ride pages list who is where. They sit between the two places they are walking between. */}
      <ul className="map__walkers" aria-hidden="true">
        {guests?.walkers.map((w) => {
          const at = WalkPath.point(spots.get(w.from ?? '') ?? spots.get(w.to ?? ''), spots.get(w.to ?? '') ?? spots.get(w.from ?? ''), `${w.id}${w.since}`)
          return at ? (
            <li key={w.id} className="walker" style={{ left: `${at.x}%`, top: `${at.y}%` }}>
              <Avatar hue={w.hue} initials={w.initials} size={22} />
            </li>
          ) : null
        })}
      </ul>
      <ul className="map__rides" aria-label={t('home.ridesOnMap')}>
        {rides.map((r, i) => {
          const level = WaitLabel.level(r.wait, r.closed)
          const src = rideIconSrc(r.icon)
          const faces = guests?.queues[r.id]?.faces ?? []
          const label = WaitLabel.spoken(r.name, r.wait, r.closed, t)
          return (
            <li key={r.id} className="map__ride" style={{ left: `${r.x}%`, top: `${r.y}%` }}>
              <Link
                to="/rides/$slug"
                params={{ slug: r.slug }}
                className={`marker marker--${level}`}
                style={{ '--i': i } as CSSProperties}
                aria-label={r.queue > 0 ? t('queue.spoken', { label, n: r.queue }) : label}
              >
                <span className="marker__bubble">
                  {src && <img src={src} alt="" width={160} height={148} loading="lazy" decoding="async" />}
                </span>
                <WaitPill wait={r.wait} closed={r.closed} level={level} />
                {r.queue > 0 && (
                  <span className="marker__queue" aria-hidden="true">
                    <span className="marker__faces">
                      {faces.map((f) => (
                        <Avatar key={f.id} hue={f.hue} initials={f.initials} size={18} />
                      ))}
                    </span>
                    {t('queue.chip', { n: r.queue })}
                  </span>
                )}
                <span className="marker__name" aria-hidden="true">
                  {r.name}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
