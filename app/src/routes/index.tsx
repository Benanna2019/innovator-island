import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { api } from '../../convex/_generated/api'
import { useI18n } from '#/components/I18nProvider'
import { OutageBanner } from '#/components/OutageBanner'
import { ParkMap } from '#/components/ParkMap'
import { RideList } from '#/components/RideList'
import { SiteFooter } from '#/components/SiteFooter'
import { SiteHeader } from '#/components/SiteHeader'

const PARK_SLUG = 'innovator-island'

export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(api.rides.list, { parkSlug: PARK_SLUG })),
      context.queryClient.ensureQueryData(convexQuery(api.outages.active, { parkSlug: PARK_SLUG })),
      context.queryClient.ensureQueryData(convexQuery(api.guests.onMap, { parkSlug: PARK_SLUG })),
    ])
  },
  component: Home,
})

function Home() {
  const { t } = useI18n()
  const { data } = useSuspenseQuery(convexQuery(api.rides.list, { parkSlug: PARK_SLUG }))
  const { data: guests } = useSuspenseQuery(convexQuery(api.guests.onMap, { parkSlug: PARK_SLUG }))
  const [beforeCmd, afterCmd] = t('home.empty', { command: '\u0000' }).split('\u0000')

  return (
    <>
      <SiteHeader title={data?.park.name ?? 'Innovator Island'} intro={t('site.tagline')} />
      <OutageBanner parkSlug={PARK_SLUG} />
      <main id="main" tabIndex={-1}>
        {data === null ? (
          <p className="empty">
            {beforeCmd}
            <code>npx convex run seed:run</code>
            {afterCmd}
          </p>
        ) : (
          <div className="park">
            <section aria-labelledby="map-heading" className="park__map">
              <h2 id="map-heading">{t('home.map')}</h2>
              {guests && guests.inPark > 0 && (
                <p className="hint">
                  {t('home.guestsInPark', { n: guests.inPark })}
                </p>
              )}
              <ParkMap rides={data.rides} guests={guests} />
            </section>
            <section aria-labelledby="list-heading" className="park__list">
              <h2 id="list-heading">{t('home.list')}</h2>
              <p className="hint">{t('home.listHint')}</p>
              <RideList rides={data.rides} />
            </section>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
