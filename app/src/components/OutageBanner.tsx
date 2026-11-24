import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { api } from '../../convex/_generated/api'
import { useI18n } from './I18nProvider'

/**
 * Open outages, drawn as a park announcement board. The wrapper is always rendered so screen readers register the
 * live region before anything is announced into it. Replaces the upstream outage alert pushed over IoT MQTT.
 */
export function OutageBanner({ parkSlug }: { parkSlug: string }) {
  const { t } = useI18n()
  const { data: outages } = useSuspenseQuery(convexQuery(api.outages.active, { parkSlug }))
  return (
    <section className="outages" aria-label={t('outage.label')}>
      <div role="status" aria-live="polite" aria-atomic="false">
        {outages.length > 0 && (
          <div className="board">
            <p className="board__title">{t('outage.board')}</p>
            <ul className="board__list">
              {outages.map((o) => (
                <li key={o.id} className="board__item">
                  <span className="board__sign">{t('outage.sign')}</span>
                  <span>{t('outage.item', { ride: o.rideName, reason: o.reason })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
