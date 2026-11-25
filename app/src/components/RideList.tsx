import { Link } from '@tanstack/react-router'
import { WaitLabel } from '#/domain/wait-label'
import type { MapRide } from './ParkMap'
import { useI18n } from './I18nProvider'
import { WaitPill, rideIconSrc } from './WaitPill'

export function RideList({ rides }: { rides: readonly MapRide[] }) {
  const { t } = useI18n()
  return (
    <ul className="rides">
      {rides.map((r) => {
        const level = WaitLabel.level(r.wait, r.closed)
        const src = rideIconSrc(r.icon)
        return (
          <li key={r.id} id={`ride-${r.slug}`} className="ride">
            {src && <img className="ride__icon" src={src} alt="" width={48} height={44} loading="lazy" decoding="async" />}
            <Link to="/rides/$slug" params={{ slug: r.slug }} className="ride__name">
              {r.name}
            </Link>
            {r.queue > 0 && <span className="ride__queue">{t('queue.chip', { n: r.queue })}</span>}
            <WaitPill wait={r.wait} closed={r.closed} level={level} />
          </li>
        )
      })}
    </ul>
  )
}
