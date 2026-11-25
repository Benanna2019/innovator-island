import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { api } from '../../convex/_generated/api'
import { useI18n } from '#/components/I18nProvider'
import { LOCALES } from '#/i18n'
import { SiteFooter } from '#/components/SiteFooter'
import { SiteHeader } from '#/components/SiteHeader'

const PARK_SLUG = 'innovator-island'

export const Route = createFileRoute('/stats')({
  loader: ({ context }) => context.queryClient.ensureQueryData(convexQuery(api.stats.summary, { parkSlug: PARK_SLUG })),
  component: Stats,
})

function Stats() {
  const { t, locale } = useI18n()
  const { data } = useSuspenseQuery(convexQuery(api.stats.summary, { parkSlug: PARK_SLUG }))
  const numbers = new Intl.NumberFormat(locale)
  // Relative hour labels give the same text on the server and in any time zone, so hydration always matches.
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  return (
    <>
      <SiteHeader title={t('stats.title')} intro={t('stats.intro')} />
      <main id="main" tabIndex={-1}>
        {data === null ? (
          <p className="empty">{t('stats.empty')}</p>
        ) : (
          <>
            {data.park.paused && <p className="empty">{t('stats.paused')}</p>}
            <section aria-labelledby="totals-heading">
              <h2 id="totals-heading" className="visually-hidden">
                {t('stats.title')}
              </h2>
              <dl className="stats">
                <Stat label={t('stats.headcount')} value={numbers.format(data.headcount)} />
                <Stat label={t('stats.visitors')} value={numbers.format(data.totalVisitors)} />
                <Stat label={t('stats.rides')} value={numbers.format(data.totalRides)} />
                <Stat
                  label={t('stats.rating')}
                  value={data.averageRating === null ? t('stats.noRating') : numbers.format(data.averageRating)}
                />
              </dl>
            </section>
            <section aria-labelledby="hours-heading">
              <h2 id="hours-heading">{t('stats.perHour')}</h2>
              <HourBars rows={data.ridesPerHour} format={(hoursAgo) => relative.format(-hoursAgo, 'hour')} numbers={numbers} />
            </section>
            <section aria-labelledby="over-time-heading">
              <h2 id="over-time-heading">{t('stats.overTime')}</h2>
              <HourBars
                rows={data.headcountOverTime.map((p) => ({ from: p.at, rides: p.headcount }))}
                format={(hoursAgo) => relative.format(-hoursAgo + 1, 'hour')}
                numbers={numbers}
                label="stats.overTimeLabel"
              />
            </section>
            <section aria-labelledby="languages-heading">
              <h2 id="languages-heading">{t('stats.languages')}</h2>
              <p className="hint">{t('stats.guests')}: {numbers.format(data.guestsInPark)}</p>
              <ol className="bars">
                {LOCALES.map((l) => {
                  const count = data.languages[l.code]
                  const max = Math.max(1, ...Object.values(data.languages))
                  return (
                    <li key={l.code} className="bars__row">
                      <span className="bars__label" lang={l.code}>
                        {l.label}
                      </span>
                      <span className="bars__track" aria-hidden="true">
                        <span className="bars__fill" style={{ width: `${(count / max) * 100}%` }} />
                      </span>
                      <span className="bars__value">{numbers.format(count)}</span>
                    </li>
                  )
                })}
              </ol>
            </section>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function HourBars({
  rows,
  format,
  numbers,
  label = 'stats.hourLabel',
}: {
  rows: readonly { from: number; rides: number }[]
  format: (hoursAgo: number) => string
  numbers: Intl.NumberFormat
  label?: 'stats.hourLabel' | 'stats.overTimeLabel'
}) {
  const { t } = useI18n()
  const max = Math.max(1, ...rows.map((r) => r.rides))
  return (
    <ol className="bars">
      {rows.map((row, i) => (
        <li key={row.from} className="bars__row">
          <span className="bars__label">{t(label, { time: format(rows.length - i) })}</span>
          <span className="bars__track" aria-hidden="true">
            <span className="bars__fill" style={{ width: `${(row.rides / max) * 100}%` }} />
          </span>
          <span className="bars__value">{numbers.format(row.rides)}</span>
        </li>
      ))}
    </ol>
  )
}
