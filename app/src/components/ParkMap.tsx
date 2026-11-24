import { Link } from '@tanstack/react-router'
import type { CSSProperties } from 'react'
import { FACILITIES } from '#/domain/facilities'
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
export function ParkMap({ rides }: { rides: readonly MapRide[] }) {
  const { t } = useI18n()
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
      <ul className="map__rides" aria-label={t('home.ridesOnMap')}>
        {rides.map((r, i) => {
          const level = WaitLabel.level(r.wait, r.closed)
          const src = rideIconSrc(r.icon)
          return (
            <li key={r.id} className="map__ride" style={{ left: `${r.x}%`, top: `${r.y}%` }}>
              <Link
                to="/rides/$slug"
                params={{ slug: r.slug }}
                className={`marker marker--${level}`}
                style={{ '--i': i } as CSSProperties}
                aria-label={WaitLabel.spoken(r.name, r.wait, r.closed, t)}
              >
                <span className="marker__bubble">
                  {src && <img src={src} alt="" width={160} height={148} loading="lazy" decoding="async" />}
                </span>
                <WaitPill wait={r.wait} closed={r.closed} level={level} />
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
