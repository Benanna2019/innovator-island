import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { api } from '../../convex/_generated/api'
import { useI18n } from '#/components/I18nProvider'
import { Avatar } from '#/components/Avatar'
import { OutageBanner } from '#/components/OutageBanner'
import { SiteFooter } from '#/components/SiteFooter'
import { SiteHeader } from '#/components/SiteHeader'
import { WaitPill, rideIconSrc } from '#/components/WaitPill'
import { WaitLabel } from '#/domain/wait-label'

const PARK_SLUG = 'innovator-island'

export const Route = createFileRoute('/rides/$slug')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(api.rides.list, { parkSlug: PARK_SLUG })),
      context.queryClient.ensureQueryData(convexQuery(api.outages.active, { parkSlug: PARK_SLUG })),
      context.queryClient.ensureQueryData(convexQuery(api.guests.forRide, { parkSlug: PARK_SLUG, rideSlug: params.slug })),
    ])
  },
  component: RidePage,
})

/** The ride card, like the original Ride.vue: big icon, wait, status and a link to the photo flow. */
function RidePage() {
  const { t } = useI18n()
  const { slug } = Route.useParams()
  const { data } = useSuspenseQuery(convexQuery(api.rides.list, { parkSlug: PARK_SLUG }))
  const ride = data?.rides.find((r) => r.slug === slug)
  const { data: guests } = useSuspenseQuery(convexQuery(api.guests.forRide, { parkSlug: PARK_SLUG, rideSlug: slug }))
  const src = ride ? rideIconSrc(ride.icon) : null

  return (
    <>
      <SiteHeader title={ride?.name ?? t('ride.details')} intro={t('ride.details')} />
      <OutageBanner parkSlug={PARK_SLUG} />
      <main id="main" tabIndex={-1}>
        <p>
          <Link to="/" className="back-link">
            {t('ride.back')}
          </Link>
        </p>
        {ride ? (
          <article className="ride-card" aria-label={ride.name}>
            {src && <img className="ride-card__icon" src={src} alt="" width={160} height={148} />}
            <div className="ride-card__body">
              <dl className="ride-card__facts">
                <div>
                  <dt>{t('ride.waitNow')}</dt>
                  <dd aria-live="polite">
                    <WaitPill wait={ride.wait} closed={ride.closed} level={WaitLabel.level(ride.wait, ride.closed)} />
                  </dd>
                </div>
                <div>
                  <dt>{t('ride.status')}</dt>
                  <dd>{ride.closed ? t('ride.statusClosed') : t('ride.statusOpen')}</dd>
                </div>
              </dl>
              <Link to="/photos" className="button">
                {t('ride.addPhoto')}
              </Link>
            </div>
          </article>
        ) : (
          <p className="empty">{t('ride.notFound')}</p>
        )}
        {ride && guests && (
          <div className="ride-people">
            <section aria-labelledby="queue-heading">
              <h2 id="queue-heading">{t('ride.queue.heading')}</h2>
              {guests.queue.length === 0 ? (
                <p className="hint">{t('ride.queue.empty')}</p>
              ) : (
                <>
                  <GuestList guests={guests.queue} />
                  {ride.queue > guests.queue.length && <p className="hint">{t('ride.queue.more', { n: ride.queue - guests.queue.length })}</p>}
                </>
              )}
              {guests.riding.length > 0 && (
                <>
                  <h3>{t('ride.riding.heading')}</h3>
                  <GuestList guests={guests.riding} />
                </>
              )}
            </section>
            <section aria-labelledby="recent-heading">
              <h2 id="recent-heading">{t('ride.recent.heading')}</h2>
              {guests.recent.length === 0 ? (
                <p className="hint">{t('ride.recent.empty')}</p>
              ) : (
                <GuestList guests={guests.recent} />
              )}
            </section>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  )
}

interface PersonView {
  id: string
  name: string
  initials: string
  hue: number
  language: string
}

/** Faces with names. The language is on each name so a screen reader pronounces it correctly. */
function GuestList({ guests }: { guests: readonly PersonView[] }) {
  return (
    <ul className="people">
      {guests.map((g) => (
        <li key={g.id} className="person">
          <Avatar hue={g.hue} initials={g.initials} size={32} />
          <span lang={g.language}>{g.name}</span>
        </li>
      ))}
    </ul>
  )
}
