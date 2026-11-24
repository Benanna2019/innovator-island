import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { api } from '../../convex/_generated/api'
import { useI18n } from '#/components/I18nProvider'
import { OutageBanner } from '#/components/OutageBanner'
import { SiteFooter } from '#/components/SiteFooter'
import { SiteHeader } from '#/components/SiteHeader'
import { WaitPill, rideIconSrc } from '#/components/WaitPill'
import { WaitLabel } from '#/domain/wait-label'

const PARK_SLUG = 'innovator-island'

export const Route = createFileRoute('/rides/$slug')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(api.rides.list, { parkSlug: PARK_SLUG })),
      context.queryClient.ensureQueryData(convexQuery(api.outages.active, { parkSlug: PARK_SLUG })),
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
      </main>
      <SiteFooter />
    </>
  )
}
